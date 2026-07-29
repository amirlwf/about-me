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

function generateCode(): string {
  // Generate a 6-digit numeric code using cryptographic randomness
  // Use rejection sampling to avoid bias (re-roll values >= 250)
  const digits: number[] = []
  const byte = new Uint8Array(1)
  while (digits.length < 6) {
    crypto.getRandomValues(byte)
    if (byte[0] < 250) {
      digits.push(byte[0] % 10)
    }
  }
  return digits.join("")
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Verify admin session
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
    if (!session.valid) {
      return new Response(
        JSON.stringify({ error: "جلسه مدیر منقضی شده. لطفاً دوباره وارد شوید" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Read custom duration from request body (default 5 minutes, max 1440 minutes = 24h)
    let durationMinutes = 5
    try {
      const body = await req.json()
      if (body.duration_minutes && typeof body.duration_minutes === 'number') {
        durationMinutes = Math.max(1, Math.min(1440, Math.floor(body.duration_minutes)))
      }
    } catch {
      // No body or invalid JSON — use default 5 minutes
    }

    // Generate a unique code
    let code = generateCode()
    let attempts = 0
    while (attempts < 10) {
      const { data: existing } = await supabaseAdmin
        .from("entry_codes")
        .select("id")
        .eq("code", code)
        .single()

      if (!existing) break
      code = generateCode()
      attempts++
    }

    // Create the entry code with custom duration
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
      .from("entry_codes")
      .insert({
        code: code,
        is_active: true,
        activated_at: new Date().toISOString(),
        expires_at: expiresAt,
        created_by: session.admin_id,
      })
      .select("id, code, expires_at")
      .single()

    if (error) {
      return new Response(
        JSON.stringify({ error: "خطا در ایجاد کد ورود" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({
        message: "کد ورود با موفقیت فعال شد",
        code: data.code,
        expires_at: data.expires_at,
        id: data.id,
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
