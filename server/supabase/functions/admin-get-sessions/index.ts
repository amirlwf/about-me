import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

async function verifyAdminSession(
  supabaseAdmin: any,
  token: string
): Promise<{ valid: boolean; admin_id?: string; session_id?: string }> {
  const encoder = new TextEncoder()
  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token))
  const tokenHash = Array.from(new Uint8Array(tokenHashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  const { data: session, error } = await supabaseAdmin
    .from("admin_sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .single()

  if (error || !session) {
    return { valid: false }
  }

  return { valid: true, admin_id: session.admin_id, session_id: session.id }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "احراز هویت مدیر لازم است" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const token = authHeader.replace("Bearer ", "")
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const session = await verifyAdminSession(supabaseAdmin, token)
    if (!session.valid || !session.session_id) {
      return new Response(
        JSON.stringify({ error: "جلسه مدیر منقضی شده" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Get all active sessions for this admin (excluding current one for "other sessions" display)
    const { data: sessions, error } = await supabaseAdmin
      .from("admin_sessions")
      .select("id, admin_id, expires_at, created_at, user_agent, ip_address")
      .eq("admin_id", session.admin_id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      return new Response(
        JSON.stringify({ error: "خطا در دریافت جلسات فعال" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({
        sessions: sessions || [],
        current_session_id: session.session_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "خطای داخلی سرور" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
