import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Delete related data in order (using service role bypasses RLS)
    // 1. Scan records (can be very large)
    let scanDeleted = 0;
    while (true) {
      const { data: batch } = await supabase
        .from('scan_records')
        .select('id')
        .eq('template_id', templateId)
        .limit(1000);

      if (!batch || batch.length === 0) break;

      const ids = batch.map(r => r.id);
      const { error: delErr } = await supabase
        .from('scan_records')
        .delete()
        .in('id', ids);

      if (delErr) {
        console.error('[delete-template] scan_records delete error:', delErr);
        throw delErr;
      }
      scanDeleted += ids.length;
      console.log(`[delete-template] Deleted ${scanDeleted} scan records so far...`);
    }

    // 2. Template issues
    const { error: issuesErr } = await supabase
      .from('template_issues')
      .delete()
      .eq('template_id', templateId);
    if (issuesErr) console.warn('[delete-template] template_issues:', issuesErr.message);

    // 3. Cost items (can be very large)
    let costDeleted = 0;
    while (true) {
      const { data: batch } = await supabase
        .from('template_cost_items')
        .select('id')
        .eq('template_id', templateId)
        .limit(1000);

      if (!batch || batch.length === 0) break;

      const ids = batch.map(r => r.id);
      const { error: delErr } = await supabase
        .from('template_cost_items')
        .delete()
        .in('id', ids);

      if (delErr) {
        console.error('[delete-template] cost_items delete error:', delErr);
        throw delErr;
      }
      costDeleted += ids.length;
      console.log(`[delete-template] Deleted ${costDeleted} cost items so far...`);
    }

    // 4. Sections
    const { error: sectionsErr } = await supabase
      .from('template_sections')
      .delete()
      .eq('template_id', templateId);
    if (sectionsErr) {
      console.error('[delete-template] sections delete error:', sectionsErr);
      throw sectionsErr;
    }

    // 5. Finally delete the template itself
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
