import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-internal-service-key",
};

const INTERNAL_AUTH_HEADER = "x-internal-service-key";
const FINALIZE_TIME_BUDGET_MS = 20_000;
const MERGE_BATCH = 2_000;
const FINALIZE_LOCK_NAMESPACE = "process-cost-import-finalize";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sqlVal(val: string | null): string {
  if (val == null) return "NULL";
  return `'${val.replace(/'/g, "''")}'`;
}

function sqlNum(val: number | null): string {
  if (val == null) return "NULL";
  return String(val);
}

function truncate(val: any, maxLen = 255): string | null {
  if (val == null) return null;
  const str = String(val).trim();
  return str.length > maxLen ? str.substring(0, maxLen) : str || null;
}

function advisoryLockSql(key: string): string {
  return `hashtext('${key.replace(/'/g, "''")}')`;
}

async function queueFinalizeResume(params: {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  jobId: string;
  totalRows: number;
}) {
  const { supabaseUrl, anonKey, serviceKey, jobId, totalRows } = params;
  const resumePromise = fetch(`${supabaseUrl}/functions/v1/process-cost-import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      [INTERNAL_AUTH_HEADER]: serviceKey,
    },
    body: JSON.stringify({
      job_id: jobId,
      action: "finalize",
      total_rows: totalRows,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.error(
          `[process-cost-import] Resume request failed for ${jobId}:`,
          await res.text()
        );
      }
    })
    .catch((err) => {
      console.error(`[process-cost-import] Resume request error for ${jobId}:`, err.message);
    });

  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(resumePromise);
  } else {
    void resumePromise;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;

  try {
    const isInternalRequest = req.headers.get(INTERNAL_AUTH_HEADER) === serviceKey;

    // Auth check for user-triggered requests
    let user: { id: string } | null = null;
    if (!isInternalRequest) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return jsonResponse({ error: "Missing authorization" }, 401);
      }

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user: authUser },
        error: authError,
      } = await userClient.auth.getUser();

      if (authError || !authUser) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      user = { id: authUser.id };
    }

    const body = await req.json();
    const { job_id, action } = body;
    // action: 'append' | 'finalize'
    // append: { job_id, action: 'append', rows: [...], chunk_index, total_chunks }
    // finalize: { job_id, action: 'finalize', total_rows }

    if (!job_id) {
      return jsonResponse({ error: "job_id required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch job record
    const { data: job, error: jobErr } = await admin
      .from("import_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return jsonResponse({ error: "Job not found" }, 404);
    }

    if (!isInternalRequest && user && job.user_id !== user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // ─── APPEND: bulk insert a chunk of rows into staging ───
    if (action === "append") {
      const { rows, columns, chunk_index, total_chunks } = body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return jsonResponse({ error: "rows array required" }, 400);
      }

      // Mark processing on first chunk
      if (chunk_index === 0) {
        await admin
          .from("import_jobs")
          .update({
            status: "processing",
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);
      }

      // Build column index map for compact array format
      const FIELD_NAMES = ['ndc','material_description','unit_price','source','material','billing_date','manufacturer','generic','strength','size','dose','sheet_name'];
      const isCompact = Array.isArray(columns);
      let colMap: number[] = [];
      if (isCompact) {
        // Map each FIELD_NAME to its index in the incoming columns array
        colMap = FIELD_NAMES.map(f => (columns as string[]).indexOf(f));
      }

      // Helper to extract field value from a row (compact array or object)
      const getField = (item: any, fieldName: string, fieldIdx: number): any => {
        if (isCompact) {
          const idx = colMap[fieldIdx];
          return idx >= 0 ? item[idx] : null;
        }
        return item[fieldName];
      };

      const pool = new Pool(dbUrl, 1);
      const conn = await pool.connect();
      try {
        // Batch insert into staging — 10K rows per INSERT for fewer SQL round-trips
        const BATCH_SIZE = 10000;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const valueRows = batch
            .map(
              (item: any) =>
                `(${sqlVal(job_id)},${sqlVal(job.template_id)},${sqlVal(truncate(getField(item, 'ndc', 0), 50))},${sqlVal(truncate(getField(item, 'material_description', 1), 255))},${sqlNum(getField(item, 'unit_price', 2))},${sqlVal(truncate(getField(item, 'source', 3), 255))},${sqlVal(truncate(getField(item, 'material', 4), 50))},${sqlVal(truncate(getField(item, 'billing_date', 5), 50))},${sqlVal(truncate(getField(item, 'manufacturer', 6), 255))},${sqlVal(truncate(getField(item, 'generic', 7), 255))},${sqlVal(truncate(getField(item, 'strength', 8), 100))},${sqlVal(truncate(getField(item, 'size', 9), 50))},${sqlVal(truncate(getField(item, 'dose', 10), 100))},${sqlVal(truncate(getField(item, 'sheet_name', 11), 50))})`
            )
            .join(",\n");

          await conn.queryArray(
            `INSERT INTO public.import_staging_cost_items
             (job_id, template_id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name)
             VALUES ${valueRows}`
          );
        }

        // Update progress
        const currentProcessed = (job.processed_rows || 0) + rows.length;
        await admin
          .from("import_jobs")
          .update({
            processed_rows: currentProcessed,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);

        console.log(
          `[process-cost-import] Chunk ${chunk_index + 1}/${total_chunks}: staged ${rows.length} rows (total: ${currentProcessed})`
        );
      } finally {
        conn.release();
        await pool.end();
      }

      return jsonResponse({ success: true, chunk_index, rows_inserted: rows.length });
    }

    // ─── FINALIZE: merge staging → cost_items, build offline package ───
    if (action === "finalize") {
      const totalRows = Number(body.total_rows || job.total_rows || 0);
      const startTime = Date.now();

      await admin
        .from("import_jobs")
        .update({
          status: "merging",
          total_rows: totalRows,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id);

      const pool = new Pool(dbUrl, 1);
      const conn = await pool.connect();
      const escapedTemplateId = job.template_id.replace(/'/g, "''");
      const escapedJobId = job_id.replace(/'/g, "''");
      const finalizeLockKeySql = advisoryLockSql(`${FINALIZE_LOCK_NAMESPACE}:${job_id}`);

      let lockAcquired = false;
      let totalInserted = 0;
      let stagingRemaining = 0;

      try {
        await conn.queryArray(`SET statement_timeout = '15s'`);

        const lockResult = await conn.queryArray(
          `SELECT pg_try_advisory_lock(${finalizeLockKeySql})`
        );
        lockAcquired = Boolean(lockResult.rows?.[0]?.[0]);

        if (!lockAcquired) {
          console.log(`[process-cost-import] Finalize already running for ${job_id}, skipping duplicate request`);
          return jsonResponse(
            {
              success: true,
              job_id,
              busy: true,
              message: "Finalize already in progress",
            },
            202
          );
        }

        const stagingBeforeResult = await conn.queryArray(
          `SELECT COUNT(*)::bigint FROM public.import_staging_cost_items WHERE job_id = '${escapedJobId}'`
        );
        const stagingBefore = Number(stagingBeforeResult.rows?.[0]?.[0] ?? 0);
        const existingCostItemsResult = await conn.queryArray(
          `SELECT COUNT(*)::bigint FROM public.template_cost_items WHERE template_id = '${escapedTemplateId}'`
        );
        const existingCostItems = Number(existingCostItemsResult.rows?.[0]?.[0] ?? 0);
        const shouldDeleteExisting = totalRows > 0 ? stagingBefore >= totalRows : stagingBefore > 0;

        if (
          totalRows > 0 &&
          stagingBefore > 0 &&
          existingCostItems > 0 &&
          stagingBefore < totalRows &&
          existingCostItems + stagingBefore !== totalRows
        ) {
          console.warn(
            `[process-cost-import] Existing cost item count (${existingCostItems}) plus staging rows (${stagingBefore}) does not match expected total (${totalRows}) for template ${job.template_id}. This usually means overlapping finalize requests previously inserted duplicate rows.`
          );
        }

        if (shouldDeleteExisting) {
          console.log(`[process-cost-import] Merging: deleting old cost items for template ${job.template_id}`);
          let totalDeleted = 0;
          while (true) {
            const delResult = await conn.queryArray(
              `WITH to_delete AS (
                 SELECT ctid FROM public.template_cost_items
                 WHERE template_id = '${escapedTemplateId}'
                 LIMIT ${MERGE_BATCH}
               ),
               deleted AS (
                 DELETE FROM public.template_cost_items
                 WHERE ctid IN (SELECT ctid FROM to_delete)
                 RETURNING 1
               )
               SELECT COUNT(*)::int FROM deleted`
            );
            const deleted = Number(delResult.rows?.[0]?.[0] ?? 0);
            totalDeleted += deleted;
            if (deleted > 0) {
              console.log(`[process-cost-import] Deleted batch: ${deleted} (total: ${totalDeleted})`);
            }
            if (deleted < MERGE_BATCH) break;
            if (Date.now() - startTime >= FINALIZE_TIME_BUDGET_MS) break;
          }
          console.log(`[process-cost-import] Delete complete: ${totalDeleted} rows removed`);
        } else {
          console.log(
            `[process-cost-import] Resuming merge for ${job.template_id} with ${stagingBefore} staging rows remaining`
          );
        }

        while (Date.now() - startTime < FINALIZE_TIME_BUDGET_MS) {
          const mergeResult = await conn.queryArray(
            `WITH batch AS (
               SELECT id, template_id, ndc, material_description, unit_price, source, material,
                      billing_date, manufacturer, generic, strength, size, dose, sheet_name
               FROM public.import_staging_cost_items
               WHERE job_id = '${escapedJobId}'
               ORDER BY id
               LIMIT ${MERGE_BATCH}
               FOR UPDATE SKIP LOCKED
             ),
             inserted AS (
               INSERT INTO public.template_cost_items
                 (id, template_id, ndc, material_description, unit_price, source, material,
                  billing_date, manufacturer, generic, strength, size, dose, sheet_name)
               SELECT id, template_id, ndc, material_description, unit_price, source, material,
                      billing_date, manufacturer, generic, strength, size, dose, sheet_name
               FROM batch
               ON CONFLICT (id) DO NOTHING
               RETURNING 1
             ),
             deleted AS (
               DELETE FROM public.import_staging_cost_items
               WHERE id IN (SELECT id FROM batch)
               RETURNING 1
             )
             SELECT COUNT(*)::int FROM deleted`
          );

          const moved = Number(mergeResult.rows?.[0]?.[0] ?? 0);
          if (moved === 0) break;

          totalInserted += moved;
          console.log(`[process-cost-import] Merged batch: ${moved} (total this run: ${totalInserted})`);

          if (moved < MERGE_BATCH) break;
        }

        const stagingRemainingResult = await conn.queryArray(
          `SELECT COUNT(*)::bigint FROM public.import_staging_cost_items WHERE job_id = '${escapedJobId}'`
        );
        stagingRemaining = Number(stagingRemainingResult.rows?.[0]?.[0] ?? 0);
        console.log(`[process-cost-import] Merge pass complete: ${totalInserted} rows moved, ${stagingRemaining} remaining`);
      } finally {
        if (lockAcquired) {
          await conn.queryArray(`SELECT pg_advisory_unlock(${finalizeLockKeySql})`).catch((err) => {
            console.error(`[process-cost-import] Failed to release finalize lock for ${job_id}:`, err.message);
          });
        }
        conn.release();
        await pool.end();
      }

      if (stagingRemaining > 0) {
        await admin
          .from("import_jobs")
          .update({
            status: "merging",
            processed_rows: totalRows > 0 ? totalRows - stagingRemaining : job.processed_rows,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);

        console.log(`[process-cost-import] Re-queueing finalize for ${job_id} (${stagingRemaining} rows remaining)`);
        await queueFinalizeResume({
          supabaseUrl,
          anonKey,
          serviceKey,
          jobId: job_id,
          totalRows,
        });

        return jsonResponse(
          {
            success: true,
            job_id,
            resumed: true,
            remaining_rows: stagingRemaining,
            merged_rows_this_run: totalInserted,
          },
          202
        );
      }

      // Final cleanup of any remaining staging rows
      const cleanupPool = new Pool(dbUrl, 1);
      const cleanupConn = await cleanupPool.connect();
      try {
        await cleanupConn.queryArray(
          `DELETE FROM public.import_staging_cost_items WHERE job_id = '${escapedJobId}'`
        );
      } finally {
        cleanupConn.release();
        await cleanupPool.end();
      }

      // Update template cost_file_name
      if (job.cost_file_name) {
        await admin
          .from("data_templates")
          .update({
            cost_file_name: job.cost_file_name,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.template_id);
      }

      // ── Verify data integrity before building package ──
      const verifyPool = new Pool(dbUrl, 1);
      const verifyConn = await verifyPool.connect();
      let actualCostItemCount = 0;
      try {
        const countResult = await verifyConn.queryArray(
          `SELECT COUNT(*)::bigint FROM public.template_cost_items WHERE template_id = '${escapedTemplateId}'`
        );
        actualCostItemCount = Number(countResult.rows?.[0]?.[0] ?? 0);

        const stagingLeftResult = await verifyConn.queryArray(
          `SELECT COUNT(*)::bigint FROM public.import_staging_cost_items WHERE job_id = '${escapedJobId}'`
        );
        const stagingLeft = Number(stagingLeftResult.rows?.[0]?.[0] ?? 0);

        console.log(
          `[process-cost-import] Integrity check: ${actualCostItemCount} cost items, ${stagingLeft} staging remaining, expected ${totalRows}`
        );

        if (stagingLeft > 0) {
          // Staging not fully merged — this should not happen if we reached here, but guard against it
          console.error(`[process-cost-import] INTEGRITY FAIL: ${stagingLeft} rows still in staging!`);
          await admin
            .from("import_jobs")
            .update({
              status: "failed",
              package_status: "failed",
              package_error: `Data integrity failure: ${stagingLeft} rows still in staging table after merge completed.`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job_id);
          return jsonResponse({ success: false, error: "Staging not fully merged" }, 500);
        }

        if (totalRows > 0 && actualCostItemCount < totalRows) {
          console.error(
            `[process-cost-import] INTEGRITY FAIL: expected ${totalRows} cost items but only ${actualCostItemCount} exist!`
          );
          await admin
            .from("import_jobs")
            .update({
              status: "failed",
              package_status: "failed",
              package_error: `Data integrity failure: expected ${totalRows} cost items but only ${actualCostItemCount} were saved. Please re-import the cost data.`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job_id);
          return jsonResponse({
            success: false,
            error: `Only ${actualCostItemCount}/${totalRows} cost items saved`,
          }, 500);
        }
      } finally {
        verifyConn.release();
        await verifyPool.end();
      }

      // Mark import complete, then try to build offline package.
      const elapsedImport = (Date.now() - startTime) / 1000;
      await admin
        .from("import_jobs")
        .update({
          status: "complete",
          processed_rows: actualCostItemCount,
          rows_per_sec: elapsedImport > 0 ? Math.round(actualCostItemCount / elapsedImport) : 0,
          completed_at: new Date().toISOString(),
          package_status: "building",
          package_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id);

      console.log(`[process-cost-import] Building offline package for template ${job.template_id} (${actualCostItemCount} verified items)`);

      try {
        const PAGE_SIZE = 5000;
        let offset = 0;
        const pkgItems: any[] = [];

        while (true) {
          const { data, error } = await admin
            .from("template_cost_items")
            .select("id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose")
            .eq("template_id", job.template_id)
            .range(offset, offset + PAGE_SIZE - 1);

          if (error) throw new Error(`Package query error: ${error.message}`);
          if (!data || data.length === 0) break;
          pkgItems.push(...data);
          offset += data.length;
          if (data.length < PAGE_SIZE) break;
        }

        console.log(`[process-cost-import] Package: ${pkgItems.length} items, compressing...`);

        // Include totalExpected so the client can verify independently
        const jsonPayload = JSON.stringify({
          items: pkgItems,
          count: pkgItems.length,
          totalExpected: actualCostItemCount,
        });
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(jsonPayload));
            controller.close();
          },
        });
        const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
        const compressedBytes = new Uint8Array(await new Response(compressedStream).arrayBuffer());

        const filePath = `${job.template_id}/cost-items.json.gz`;
        const { error: uploadError } = await admin.storage
          .from("offline-packages")
          .upload(filePath, compressedBytes, {
            contentType: "application/gzip",
            upsert: true,
          });

        if (uploadError) throw new Error(`Package upload error: ${uploadError.message}`);

        console.log(`[process-cost-import] Package uploaded: ${(compressedBytes.length / 1024 / 1024).toFixed(1)} MB (${pkgItems.length} items)`);

        await admin
          .from("import_jobs")
          .update({
            package_status: "ready",
            package_path: filePath,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);
      } catch (pkgErr: any) {
        console.error(`[process-cost-import] Package build failed:`, pkgErr.message);
        await admin
          .from("import_jobs")
          .update({
            package_status: "failed",
            package_error: pkgErr.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);
      }

      // Cleanup uploaded file if any
      if (job.file_path) {
        await admin.storage.from("uploads").remove([job.file_path]).catch(() => {});
      }

      const elapsedTotal = (Date.now() - startTime) / 1000;
      console.log(
        `[process-cost-import] Job ${job_id} complete: ${totalRows} rows in ${elapsedTotal.toFixed(1)}s`
      );

      return jsonResponse({
        success: true,
        job_id,
        total_rows: totalRows,
        elapsed_sec: elapsedTotal.toFixed(1),
      });
    }

    return jsonResponse({ error: "Invalid action. Use 'append' or 'finalize'." }, 400);
  } catch (err: any) {
    console.error(`[process-cost-import] Fatal error:`, err.message);
    return jsonResponse({ error: err.message }, 500);
  }
});