import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['developer', 'owner']);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Permission denied - privileged role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { templateId } = await req.json();
    if (!templateId) {
      return new Response(JSON.stringify({ error: 'templateId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[delete-template] User ${user.id} deleting template ${templateId}`);

    // Delete large tables in chunks (50K per call to avoid statement timeout)
    const chunkSize = 50000;
    let totalScans = 0;
    let totalCost = 0;

    // Chunk-delete scan_records
    for (let i = 0; i < 100; i++) {
      const { data, error } = await supabase.rpc('delete_template_chunk', {
        _template_id: templateId,
        _table_name: 'scan_records',
        _chunk_size: chunkSize,
      });
      if (error) { console.error('[delete-template] scan chunk error:', error); throw error; }
      totalScans += (data as number) || 0;
      if ((data as number) < chunkSize) break;
      console.log(`[delete-template] Scans deleted so far: ${totalScans}`);
    }

    // Chunk-delete cost_items
    for (let i = 0; i < 100; i++) {
      const { data, error } = await supabase.rpc('delete_template_chunk', {
        _template_id: templateId,
        _table_name: 'template_cost_items',
        _chunk_size: chunkSize,
      });
      if (error) { console.error('[delete-template] cost chunk error:', error); throw error; }
      totalCost += (data as number) || 0;
      if ((data as number) < chunkSize) break;
      console.log(`[delete-template] Cost items deleted so far: ${totalCost}`);
    }

    // Small tables - direct delete
    await supabase.rpc('delete_template_chunk', { _template_id: templateId, _table_name: 'template_sections', _chunk_size: chunkSize });
    await supabase.rpc('delete_template_chunk', { _template_id: templateId, _table_name: 'template_issues', _chunk_size: chunkSize });
    
    // Delete template itself
    const { data: delResult, error: delErr } = await supabase.rpc('delete_template_chunk', { 
      _template_id: templateId, _table_name: 'data_templates', _chunk_size: 1 
    });
    if (delErr) throw delErr;

    const result = { scan_records: totalScans, cost_items: totalCost };
    console.log(`[delete-template] Done:`, result);

    return new Response(JSON.stringify({ success: true, deleted: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[delete-template] Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
