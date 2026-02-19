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
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { eventId, newTeamMemberIds, previousTeamMemberIds = [] } = body;

    if (!eventId || !newTeamMemberIds?.length) {
      return new Response(
        JSON.stringify({ message: "No event or team members provided" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find newly added members (not in previous list)
    const addedMemberIds: string[] = newTeamMemberIds.filter(
      (id: string) => !previousTeamMemberIds.includes(id)
    );

    if (addedMemberIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No new team members added" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch the schedule event details
    const { data: event, error: eventError } = await supabase
      .from("scheduled_jobs")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      throw new Error(`Event not found: ${eventError?.message}`);
    }

    // Fetch profiles for the newly added members (team members are stored as profile IDs)
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name, email")
      .in("id", addedMemberIds)
      .not("email", "is", null);

    if (profilesError) throw profilesError;
    if (!profiles?.length) {
      return new Response(
        JSON.stringify({ message: "No profiles with email found for these IDs", addedMemberIds }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Format date nicely
    const jobDate = new Date(event.job_date + "T00:00:00");
    const formattedDate = jobDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const endDate = event.end_date
      ? new Date(event.end_date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

    const dateRange = endDate ? `${formattedDate} – ${endDate}` : formattedDate;
    const eventTypeLabel =
      event.event_type === "travel"
        ? "Travel Day"
        : event.event_type === "off"
        ? "Day Off"
        : event.event_type === "note"
        ? "Note"
        : "Work Day";

    // Send emails to each newly added member
    const emailPromises = profiles.map(async (profile: any) => {
      const name =
        profile.full_name ||
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        "Team Member";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px; border-radius: 8px;">
          <div style="background: #1e293b; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">📅 New Schedule Assignment</h1>
          </div>
          <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="color: #374151; font-size: 16px;">Hi <strong>${name}</strong>,</p>
            <p style="color: #374151;">You have been assigned to a new schedule event:</p>

            <div style="background: #f1f5f9; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; margin: 20px 0;">
              <p style="margin: 0 0 8px; font-size: 18px; font-weight: bold; color: #1e293b;">${event.client_name}</p>
              <p style="margin: 0 0 4px; color: #475569;"><strong>📆 Date:</strong> ${dateRange}</p>
              <p style="margin: 0 0 4px; color: #475569;"><strong>🏷 Type:</strong> ${eventTypeLabel}</p>
              ${event.start_time ? `<p style="margin: 0 0 4px; color: #475569;"><strong>🕐 Start Time:</strong> ${event.start_time}</p>` : ""}
              ${event.address ? `<p style="margin: 0 0 4px; color: #475569;"><strong>📍 Address:</strong> ${event.address}</p>` : ""}
              ${event.invoice_number ? `<p style="margin: 0 0 4px; color: #475569;"><strong>📋 Invoice:</strong> ${event.invoice_number}</p>` : ""}
              ${event.notes ? `<p style="margin: 0 0 4px; color: #475569;"><strong>📝 Notes:</strong> ${event.notes}</p>` : ""}
              ${event.special_notes ? `<p style="margin: 0; color: #dc2626;"><strong>⚠️ Special Notes:</strong> ${event.special_notes}</p>` : ""}
            </div>

            <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
              Please log in to the app to view full event details and confirm your availability.
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">
              This is an automated notification from the Schedule Hub.
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
          from: "Schedule Hub <noreply@resend.dev>",
          to: [profile.email],
          subject: `📅 You've been assigned: ${event.client_name} on ${formattedDate}`,
          html,
        }),
      });

      if (!emailRes.ok) {
        const err = await emailRes.text();
        console.error(`Failed to email ${profile.email}: ${err}`);
        return { email: profile.email, success: false };
      }

      console.log(`Notified ${profile.email} of assignment to event ${eventId}`);
      return { email: profile.email, success: true };
    });

    const results = await Promise.all(emailPromises);
    const sent = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({ message: `Sent ${sent} assignment notification(s)`, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in schedule-assignment-notify:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
