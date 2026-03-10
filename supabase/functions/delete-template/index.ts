import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is privileged
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is privileged (developer or owner)
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['developer', 'owner']);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Permission denied - privileged role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { templateId } = await req.json();
    if (!templateId) {
      return new Response(JSON.stringify({ error: 'templateId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[delete-template] User ${user.id} deleting template ${templateId}`);

    // Helper: delete rows in small batches by fetching IDs first
    const deleteBatched = async (table: string, templateId: string): Promise<number> => {
      let totalDeleted = 0;
      for (let i = 0; i < 5000; i++) { // safety limit
        const { data: batch, error: fetchErr } = await supabase
          .from(table)
          .select('id')
          .eq('template_id', templateId)
          .limit(200);

        if (fetchErr) {
          console.error(`[delete-template] ${table} fetch error:`, fetchErr);
          throw fetchErr;
        }
        if (!batch || batch.length === 0) break;

        const ids = batch.map((r: any) => r.id);
        const { error: delErr } = await supabase
          .from(table)
          .delete()
          .in('id', ids);

        if (delErr) {
          console.error(`[delete-template] ${table} delete error:`, delErr);
          throw delErr;
        }
        totalDeleted += ids.length;
        if (i % 10 === 0) console.log(`[delete-template] Deleted ${totalDeleted} from ${table}...`);
        if (batch.length < 200) break;
      }
      return totalDeleted;
    };

    // 1. Scan records
    const scanDeleted = await deleteBatched('scan_records', templateId);
    console.log(`[delete-template] Scan records deleted: ${scanDeleted}`);

    // 2. Template issues
    await supabase.from('template_issues').delete().eq('template_id', templateId);

    // 3. Cost items
    const costDeleted = await deleteBatched('template_cost_items', templateId);
    console.log(`[delete-template] Cost items deleted: ${costDeleted}`);

    // 4. Sections
    await supabase.from('template_sections').delete().eq('template_id', templateId);

    // 5. Template itself
    const { error: templateErr } = await supabase
      .from('data_templates')
      .delete()
      .eq('id', templateId);
    if (templateErr) {
      console.error('[delete-template] template delete error:', templateErr);
      throw templateErr;
    }

    console.log(`[delete-template] Successfully deleted template ${templateId} (${scanDeleted} scans, ${costDeleted} cost items)`);

    return new Response(JSON.stringify({ 
      success: true, 
      deleted: { scanRecords: scanDeleted, costItems: costDeleted }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[delete-template] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
