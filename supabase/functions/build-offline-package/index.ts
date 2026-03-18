import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get template_id
    let templateId: string | null = null;
    const url = new URL(req.url);
    templateId = url.searchParams.get("template_id");

    if (!templateId && req.method === "POST") {
      const body = await req.json();
      templateId = body.template_id;
    }

    if (!templateId) {
      return new Response(JSON.stringify({ error: "template_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Paginate all cost items using .range()
    const PAGE_SIZE = 500;
    let offset = 0;
    const allItems: any[] = [];

    console.log(`[build-offline-package] Starting for template ${templateId}`);

    while (true) {
      const { data, error } = await adminClient
        .from("template_cost_items")
        .select("id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose")
        .eq("template_id", templateId)
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error(`[build-offline-package] Query error at offset ${offset}:`, error.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!data || data.length === 0) break;

      allItems.push(...data);
      offset += data.length;

      if (offset % 10000 === 0) {
        console.log(`[build-offline-package] Fetched ${offset} items...`);
      }

      if (data.length < PAGE_SIZE) break;
    }

    console.log(`[build-offline-package] Total items: ${allItems.length}. Compressing...`);

    // Compress to gzip
    const jsonPayload = JSON.stringify({ items: allItems, count: allItems.length });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(jsonPayload));
        controller.close();
      },
    });
    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
    const compressedBytes = new Uint8Array(await new Response(compressedStream).arrayBuffer());

    console.log(`[build-offline-package] Compressed: ${(compressedBytes.length / 1024 / 1024).toFixed(1)} MB`);

    // Upload to storage bucket
    const filePath = `${templateId}/cost-items.json.gz`;
    const { error: uploadError } = await adminClient.storage
      .from("offline-packages")
      .upload(filePath, compressedBytes, {
        contentType: "application/gzip",
        upsert: true,
      });

    if (uploadError) {
      console.error(`[build-offline-package] Upload error:`, uploadError.message);
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[build-offline-package] Uploaded to offline-packages/${filePath}`);

    return new Response(
      JSON.stringify({
        success: true,
        itemCount: allItems.length,
        sizeBytes: compressedBytes.length,
        path: filePath,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(`[build-offline-package] Error:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
