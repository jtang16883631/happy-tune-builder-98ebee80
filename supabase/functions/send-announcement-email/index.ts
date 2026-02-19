import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@resend.dev";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { announcementId } = body;

    if (!announcementId) {
      return new Response(
        JSON.stringify({ error: "announcementId is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch the announcement
    const { data: announcement, error: annError } = await supabase
      .from("announcements")
      .select("*")
      .eq("id", announcementId)
      .single();

    if (annError || !announcement) {
      throw new Error(`Announcement not found: ${annError?.message}`);
    }

    // Fetch creator name
    let creatorName = "Management";
    if (announcement.created_by) {
      const { data: creator } = await supabase
        .from("profiles")
        .select("full_name, first_name, last_name")
        .eq("id", announcement.created_by)
        .single();
      if (creator) {
        creatorName =
          creator.full_name ||
          [creator.first_name, creator.last_name].filter(Boolean).join(" ") ||
          "Management";
      }
    }

    // Fetch all profiles with emails
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, email, first_name, last_name")
      .not("email", "is", null);

    if (profilesError) throw profilesError;
    if (!profiles?.length) {
      return new Response(
        JSON.stringify({ message: "No profiles with email found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const results: { email: string; success: boolean; error?: string }[] = [];

    const formattedDate = new Date(announcement.created_at).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    for (const profile of profiles) {
      const name =
        profile.full_name ||
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        "Team Member";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px; border-radius: 8px;">
          <div style="background: #1e293b; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">📢 New Announcement</h1>
          </div>
          <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="color: #374151; font-size: 16px;">Hi <strong>${name}</strong>,</p>
            <p style="color: #374151;">A new announcement has been posted:</p>

            <div style="background: #f1f5f9; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 4px; margin: 20px 0;">
              <h2 style="margin: 0 0 12px; font-size: 18px; color: #1e293b;">${announcement.title}</h2>
              <p style="margin: 0; color: #374151; white-space: pre-wrap; line-height: 1.6;">${announcement.content}</p>
            </div>

            <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">
              Posted by <strong>${creatorName}</strong> on ${formattedDate}
            </p>

            <p style="color: #6b7280; font-size: 13px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              This is an automated notification. Log in to the app to view all announcements.
            </p>
          </div>
        </div>
      `;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Meridian Announcements <${fromEmail}>`,
          to: [profile.email],
          subject: `📢 New Announcement: ${announcement.title}`,
          html,
        }),
      });

      if (!emailRes.ok) {
        const err = await emailRes.text();
        console.error(`Failed to email ${profile.email}: ${err}`);
        results.push({ email: profile.email, success: false, error: err });
      } else {
        console.log(`Notified ${profile.email} of announcement`);
        results.push({ email: profile.email, success: true });
      }

      await sleep(600);
    }

    const sent = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({ message: `Sent announcement email to ${sent} user(s)`, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-announcement-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
