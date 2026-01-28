import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateRoomRequest {
  name: string;
  meta?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get and validate Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: "Missing or invalid Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Create anon client to verify the user's JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate JWT and get user claims
    const { data: claimsData, error: claimsError } = await anonClient.auth.getUser(token);
    
    if (claimsError || !claimsData?.user) {
      console.error("JWT validation failed:", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: claimsError?.message || "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.user.id;
    console.log("Authenticated user:", userId);

    // Parse request body
    let body: CreateRoomRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Bad Request", details: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Bad Request", details: "name is required and must be a non-empty string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roomName = body.name.trim();
    const roomMeta = body.meta || {};

    // Use service_role client to bypass RLS and insert the room
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Creating room:", { name: roomName, owner_id: userId, meta: roomMeta });

    const { data: room, error: insertError } = await adminClient
      .from("chat_rooms")
      .insert({
        name: roomName,
        owner_id: userId,
        created_by: userId, // Keep for backwards compatibility
        meta: roomMeta,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create room", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Room created successfully:", room.id);

    // Also add the creator as an admin member of the room
    const { error: memberError } = await adminClient
      .from("chat_room_members")
      .insert({
        room_id: room.id,
        user_id: userId,
        is_admin: true,
      });

    if (memberError) {
      console.error("Failed to add creator as member:", memberError);
      // Don't fail the whole request, room was created successfully
    }

    return new Response(
      JSON.stringify({ room }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
