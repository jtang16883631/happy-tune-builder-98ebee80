import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { job_id } = body;

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to processing
    await admin.from("import_jobs").update({
      status: "processing",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job_id);

    // Immediately respond — processing continues in background
    // (Edge functions have a 400s wall-clock limit which is plenty)
    // We'll use a sync approach since we need to respond with final status for polling
    // Actually, let's process synchronously and return when done

    console.log(`[process-cost-import] Starting job ${job_id}, file: ${job.file_path}`);

    try {
      // 1. Download file from storage
      const { data: fileData, error: dlErr } = await admin.storage
        .from("uploads")
        .download(job.file_path);

      if (dlErr || !fileData) {
        throw new Error(`Failed to download file: ${dlErr?.message || "No data"}`);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      console.log(`[process-cost-import] File downloaded: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

      // 2. Parse Excel server-side
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
      
      const truncate = (val: any, maxLen = 255): string | null => {
        if (val == null) return null;
        const str = String(val).trim();
        return str.length > maxLen ? str.substring(0, maxLen) : (str || null);
      };

      const allItems: any[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        if (rows.length <= 1) continue; // Skip empty or header-only sheets

        // Skip header row (index 0), process data rows
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !row[0] || String(row[0]).trim().length === 0) continue;

          // Column order: A=NDC, B=Description, C=Price, D=Source, E=Material,
          // F=BillingDate, G=Manufacturer, H=Generic, I=Strength, J=Size, K=Dose
          let billingDate: string | null = null;
          if (row[5] != null && String(row[5]).trim()) {
            if (typeof row[5] === "number") {
              const d = new Date((row[5] - 25569) * 86400 * 1000);
              billingDate = d.toISOString().split("T")[0];
            } else {
              const parsed = new Date(String(row[5]));
              billingDate = isNaN(parsed.getTime()) ? truncate(String(row[5]), 50) : parsed.toISOString().split("T")[0];
            }
          }

          allItems.push({
            job_id,
            template_id: job.template_id,
            ndc: truncate(row[0], 50),
            material_description: truncate(row[1], 255),
            unit_price: row[2] != null ? parseFloat(String(row[2])) : null,
            source: truncate(row[3], 255),
            material: truncate(row[4], 50),
            billing_date: billingDate,
            manufacturer: truncate(row[6], 255),
            generic: truncate(row[7], 255),
            strength: truncate(row[8], 100),
            size: truncate(row[9], 50),
            dose: truncate(row[10], 100),
            sheet_name: truncate(sheetName, 50),
          });
        }
      }

      const totalRows = allItems.length;
      console.log(`[process-cost-import] Parsed ${totalRows} rows from ${workbook.SheetNames.length} sheets`);

      await admin.from("import_jobs").update({
        total_rows: totalRows,
        updated_at: new Date().toISOString(),
      }).eq("id", job_id);

      // 3. Insert into staging table in batches
      const BATCH_SIZE = 1000;
      let processedRows = 0;
      const startTime = Date.now();
      let totalBatchMs = 0;
      let batchCount = 0;

      for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
        const batch = allItems.slice(i, i + BATCH_SIZE);
        const batchStart = Date.now();

        const { error: insertErr } = await admin
          .from("import_staging_cost_items")
          .insert(batch);

        if (insertErr) {
          throw new Error(`Staging insert error at row ${i}: ${insertErr.message}`);
        }

        const batchMs = Date.now() - batchStart;
        totalBatchMs += batchMs;
        batchCount++;
        processedRows += batch.length;

        const elapsedSec = (Date.now() - startTime) / 1000;
        const rowsPerSec = elapsedSec > 0 ? Math.round(processedRows / elapsedSec) : 0;
        const avgBatchMs = Math.round(totalBatchMs / batchCount);

        // Update progress every 10 batches
        if (batchCount % 10 === 0 || i + BATCH_SIZE >= allItems.length) {
          await admin.from("import_jobs").update({
            processed_rows: processedRows,
            rows_per_sec: rowsPerSec,
            avg_batch_ms: avgBatchMs,
            updated_at: new Date().toISOString(),
          }).eq("id", job_id);

          console.log(`[process-cost-import] Staged ${processedRows}/${totalRows} (${rowsPerSec} rows/sec, ${avgBatchMs}ms/batch)`);
        }
      }

      // 4. SQL merge: delete old cost items, then insert from staging
      await admin.from("import_jobs").update({
        status: "merging",
        updated_at: new Date().toISOString(),
      }).eq("id", job_id);

      console.log(`[process-cost-import] Merging: deleting old cost items for template ${job.template_id}`);

      // Delete existing cost items (uses service role, bypasses RLS)
      // Do it in chunks to avoid statement timeout
      let deleteTotal = 0;
      while (true) {
        const { data: chunk, error: fetchErr } = await admin
          .from("template_cost_items")
          .select("id")
          .eq("template_id", job.template_id)
          .limit(5000);

        if (fetchErr) throw new Error(`Delete fetch error: ${fetchErr.message}`);
        if (!chunk || chunk.length === 0) break;

        const ids = chunk.map((r: any) => r.id);
        const { error: delErr } = await admin
          .from("template_cost_items")
          .delete()
          .in("id", ids);

        if (delErr) throw new Error(`Delete error: ${delErr.message}`);
        deleteTotal += ids.length;

        if (deleteTotal % 20000 === 0) {
          console.log(`[process-cost-import] Deleted ${deleteTotal} old cost items...`);
        }
      }

      console.log(`[process-cost-import] Deleted ${deleteTotal} old cost items. Inserting from staging...`);

      // 5. Copy from staging to final table in batches
      let lastId = "00000000-0000-0000-0000-000000000000";
      let mergedCount = 0;

      while (true) {
        const { data: stagingBatch, error: sErr } = await admin
          .from("import_staging_cost_items")
          .select("*")
          .eq("job_id", job_id)
          .gt("id", lastId)
          .order("id", { ascending: true })
          .limit(1000);

        if (sErr) throw new Error(`Staging read error: ${sErr.message}`);
        if (!stagingBatch || stagingBatch.length === 0) break;

        lastId = stagingBatch[stagingBatch.length - 1].id;

        // Map staging rows to final table format (exclude job_id and id)
        const finalRows = stagingBatch.map((row: any) => ({
          template_id: row.template_id,
          ndc: row.ndc,
          material_description: row.material_description,
          unit_price: row.unit_price,
          source: row.source,
          material: row.material,
          billing_date: row.billing_date,
          manufacturer: row.manufacturer,
          generic: row.generic,
          strength: row.strength,
          size: row.size,
          dose: row.dose,
          sheet_name: row.sheet_name,
        }));

        const { error: mergeErr } = await admin
          .from("template_cost_items")
          .insert(finalRows);

        if (mergeErr) throw new Error(`Merge insert error: ${mergeErr.message}`);
        mergedCount += finalRows.length;

        if (mergedCount % 10000 === 0) {
          console.log(`[process-cost-import] Merged ${mergedCount}/${totalRows}...`);
        }
      }

      console.log(`[process-cost-import] Merge complete: ${mergedCount} rows`);

      // 6. Cleanup staging
      await admin.from("import_staging_cost_items").delete().eq("job_id", job_id);

      // 7. Update template cost_file_name
      if (job.cost_file_name) {
        await admin.from("data_templates").update({
          cost_file_name: job.cost_file_name,
          updated_at: new Date().toISOString(),
        }).eq("id", job.template_id);
      }

      // 8. Mark job complete
      const elapsedTotal = (Date.now() - startTime) / 1000;
      await admin.from("import_jobs").update({
        status: "complete",
        processed_rows: mergedCount,
        rows_per_sec: Math.round(mergedCount / elapsedTotal),
        avg_batch_ms: batchCount > 0 ? Math.round(totalBatchMs / batchCount) : 0,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job_id);

      // 9. Cleanup uploaded file
      await admin.storage.from("uploads").remove([job.file_path]);

      console.log(`[process-cost-import] Job ${job_id} complete: ${mergedCount} rows in ${elapsedTotal.toFixed(1)}s`);

      // 10. Trigger offline package build
      try {
        const buildUrl = `${supabaseUrl}/functions/v1/build-offline-package?template_id=${job.template_id}`;
        fetch(buildUrl, {
          headers: { Authorization: `Bearer ${serviceKey}`, apikey: anonKey },
        }).catch(() => {});
      } catch { /* ignore */ }

      return new Response(
        JSON.stringify({
          success: true,
          job_id,
          total_rows: mergedCount,
          elapsed_sec: elapsedTotal.toFixed(1),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (processErr: any) {
      console.error(`[process-cost-import] Processing error:`, processErr.message);

      // Cleanup staging on error
      await admin.from("import_staging_cost_items").delete().eq("job_id", job_id).catch(() => {});

      await admin.from("import_jobs").update({
        status: "failed",
        error_message: processErr.message,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job_id);

      return new Response(
        JSON.stringify({ error: processErr.message, job_id }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (err: any) {
    console.error(`[process-cost-import] Fatal error:`, err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
