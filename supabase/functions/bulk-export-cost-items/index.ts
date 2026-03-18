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

    // Verify user is authenticated using their token
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse template_id from query string or body
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

    // Use service role to bypass RLS for server-side bulk read
    // Set a large default range header to avoid the 1000-row PostgREST default
    const adminClient = createClient(supabaseUrl, serviceKey, {
      db: { schema: 'public' },
      global: {
        headers: { 'Range': '0-99999' },
      },
    });

    // Get total count first
    const { count, error: countError } = await adminClient
      .from("template_cost_items")
      .select("id", { count: "exact", head: true })
      .eq("template_id", templateId);

    if (countError) {
      return new Response(JSON.stringify({ error: countError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cursor-paginate server-side
    // PostgREST may cap rows at max_rows (often 1000), so we use that as batch size
    // and only break when we get zero results
    const BATCH_SIZE = 1000;
    let lastId = "00000000-0000-0000-0000-000000000000";
    const allItems: any[] = [];

    while (true) {
      const { data, error } = await adminClient
        .from("template_cost_items")
        .select("id, ndc, material_description, unit_price, source, material, sheet_name, billing_date, manufacturer, generic, strength, size, dose")
        .eq("template_id", templateId)
        .gt("id", lastId)
        .order("id", { ascending: true })
        .limit(BATCH_SIZE);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!data || data.length === 0) break;

      allItems.push(...data);
      lastId = data[data.length - 1].id;

      // Only break when we got fewer rows than requested — meaning we've reached the end
      if (data.length < BATCH_SIZE) break;
    }

    const jsonPayload = JSON.stringify({ items: allItems, count: allItems.length });

    // Compress with gzip
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(jsonPayload));
        controller.close();
      },
    });

    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
    const compressedBytes = await new Response(compressedStream).arrayBuffer();

    return new Response(compressedBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "X-Total-Count": String(allItems.length),
        "X-Expected-Count": String(count ?? 0),
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
