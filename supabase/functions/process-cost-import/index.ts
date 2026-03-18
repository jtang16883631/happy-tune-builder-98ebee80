import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { job_id, action } = body;
    // action: 'append' | 'finalize'
    // append: { job_id, action: 'append', rows: [...], chunk_index, total_chunks }
    // finalize: { job_id, action: 'finalize', total_rows }

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch job record
    const { data: job, error: jobErr } = await admin
      .from("import_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── APPEND: bulk insert a chunk of rows into staging ───
    if (action === "append") {
      const { rows, chunk_index, total_chunks } = body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return new Response(JSON.stringify({ error: "rows array required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

      const pool = new Pool(dbUrl, 1);
      const conn = await pool.connect();
      try {
        // Batch insert into staging
        const BATCH_SIZE = 5000;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const valueRows = batch
            .map(
              (item: any) =>
                `(${sqlVal(job_id)},${sqlVal(job.template_id)},${sqlVal(truncate(item.ndc, 50))},${sqlVal(truncate(item.material_description, 255))},${sqlNum(item.unit_price)},${sqlVal(truncate(item.source, 255))},${sqlVal(truncate(item.material, 50))},${sqlVal(truncate(item.billing_date, 50))},${sqlVal(truncate(item.manufacturer, 255))},${sqlVal(truncate(item.generic, 255))},${sqlVal(truncate(item.strength, 100))},${sqlVal(truncate(item.size, 50))},${sqlVal(truncate(item.dose, 100))},${sqlVal(truncate(item.sheet_name, 50))})`
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

      return new Response(
        JSON.stringify({ success: true, chunk_index, rows_inserted: rows.length }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── FINALIZE: merge staging → cost_items, build offline package ───
    if (action === "finalize") {
      const { total_rows } = body;
      const startTime = Date.now();

      await admin
        .from("import_jobs")
        .update({
          status: "merging",
          total_rows: total_rows || 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id);

      const pool = new Pool(dbUrl, 1);
      const conn = await pool.connect();

      try {
        console.log(
          `[process-cost-import] Merging: deleting old cost items for template ${job.template_id}`
        );

        await conn.queryArray(
          `DELETE FROM public.template_cost_items WHERE template_id = '${job.template_id.replace(/'/g, "''")}'`
        );

        await conn.queryArray(
          `INSERT INTO public.template_cost_items
             (template_id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name)
           SELECT template_id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name
           FROM public.import_staging_cost_items
           WHERE job_id = '${job_id.replace(/'/g, "''")}'`
        );

        console.log(`[process-cost-import] Merge complete`);

        // Cleanup staging
        await conn.queryArray(
          `DELETE FROM public.import_staging_cost_items WHERE job_id = '${job_id.replace(/'/g, "''")}'`
        );
      } finally {
        conn.release();
        await pool.end();
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

      // Mark import complete, start building offline package
      const elapsedImport = (Date.now() - startTime) / 1000;
      await admin
        .from("import_jobs")
        .update({
          status: "complete",
          processed_rows: total_rows || 0,
          rows_per_sec: elapsedImport > 0 ? Math.round((total_rows || 0) / elapsedImport) : 0,
          completed_at: new Date().toISOString(),
          package_status: "building",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id);

      // Build offline package
      console.log(`[process-cost-import] Building offline package for template ${job.template_id}`);

      try {
        const PAGE_SIZE = 500;
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

        const jsonPayload = JSON.stringify({ items: pkgItems, count: pkgItems.length });
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

        console.log(`[process-cost-import] Package uploaded: ${(compressedBytes.length / 1024 / 1024).toFixed(1)} MB`);

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
        `[process-cost-import] Job ${job_id} complete: ${total_rows} rows in ${elapsedTotal.toFixed(1)}s`
      );

      return new Response(
        JSON.stringify({
          success: true,
          job_id,
          total_rows,
          elapsed_sec: elapsedTotal.toFixed(1),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'append' or 'finalize'." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error(`[process-cost-import] Fatal error:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
