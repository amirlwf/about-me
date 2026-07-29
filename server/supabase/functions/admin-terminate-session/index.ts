import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

async function verifyAdminSession(
  supabaseAdmin: any,
  token: string
): Promise<{ valid: boolean; admin_id?: string }> {
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

  return { valid: true, admin_id: session.admin_id }
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

    const currentSession = await verifyAdminSession(supabaseAdmin, token)
    if (!currentSession.valid) {
      return new Response(
        JSON.stringify({ error: "جلسه مدیر منقضی شده" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { session_id } = await req.json()
    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "شناسه جلسه الزامی است" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Verify the target session belongs to the same admin
    const { data: targetSession, error: fetchError } = await supabaseAdmin
      .from("admin_sessions")
      .select("id, admin_id")
      .eq("id", session_id)
      .single()

    if (fetchError || !targetSession) {
      return new Response(
        JSON.stringify({ error: "جلسه مورد نظر یافت نشد" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (targetSession.admin_id !== currentSession.admin_id) {
      return new Response(
        JSON.stringify({ error: "شما فقط می‌توانید جلسات خود را مدیریت کنید" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Set expires_at to now to terminate the session
    const { error } = await supabaseAdmin
      .from("admin_sessions")
      .update({ expires_at: new Date().toISOString() })
      .eq("id", session_id)

    if (error) {
      return new Response(
        JSON.stringify({ error: "خطا در پایان دادن به جلسه" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ message: "جلسه با موفقیت پایان یافت" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "خطای داخلی سرور" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
