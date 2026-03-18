// Deno.serve used directly (no import needed)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function deleteChunkWithRetry(
  supabase: any,
  templateId: string,
  tableName: string,
  chunkSize: number,
  maxRetries = 3
): Promise<number> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.rpc('delete_template_chunk', {
        _template_id: templateId,
        _table_name: tableName,
        _chunk_size: chunkSize,
      });
      if (error) throw error;
      return (data as number) || 0;
    } catch (err: any) {
      const isRetryable = err?.code === '57014' || err?.message?.includes('connection reset') || err?.message?.includes('SendRequest');
      if (isRetryable && attempt < maxRetries - 1) {
        console.log(`[delete-template] Retry ${attempt + 1} for ${tableName} chunk (${err?.code || 'network'})`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return 0;
}

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

    // Smaller chunks (5K) to avoid statement timeouts on large templates
    const chunkSize = 5000;
    let totalScans = 0;
    let totalCost = 0;

    // Chunk-delete scan_records
    for (let i = 0; i < 200; i++) {
      const deleted = await deleteChunkWithRetry(supabase, templateId, 'scan_records', chunkSize);
      totalScans += deleted;
      if (deleted < chunkSize) break;
      if (totalScans % 20000 === 0) console.log(`[delete-template] Scans deleted so far: ${totalScans}`);
    }

    // Chunk-delete cost_items
    for (let i = 0; i < 200; i++) {
      const deleted = await deleteChunkWithRetry(supabase, templateId, 'template_cost_items', chunkSize);
      totalCost += deleted;
      if (deleted < chunkSize) break;
      if (totalCost % 20000 === 0) console.log(`[delete-template] Cost items deleted so far: ${totalCost}`);
    }

    // Small tables - direct delete
    await deleteChunkWithRetry(supabase, templateId, 'template_sections', chunkSize);
    await deleteChunkWithRetry(supabase, templateId, 'template_issues', chunkSize);
    
    // Delete template itself
    await deleteChunkWithRetry(supabase, templateId, 'data_templates', 1);

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
