import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// SHA-256 password verification (matches the hash stored in admin_users table)
// Stored hash = SHA-256(password + "_salt_vless_admin") as hex
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + "_salt_vless_admin")
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const computedHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  return computedHash === storedHash
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "نام کاربری و رمز عبور الزامی هستند" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Rate limit check
    const { data: rateCheck } = await supabaseAdmin.rpc("check_rate_limit", {
      p_identifier: `admin_${username}`,
      p_action: "admin_login",
      p_max_attempts: 10,
      p_window_seconds: 600,
    })

    if (rateCheck === false) {
      return new Response(
        JSON.stringify({ error: "تعداد تلاش‌ها بیش از حد مجاز است. لطفاً ۱۰ دقیقه صبر کنید" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Look up admin user
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admin_users")
      .select("*")
      .eq("username", username.trim())
      .single()

    if (adminError || !admin) {
      return new Response(
        JSON.stringify({ error: "نام کاربری یا رمز عبور اشتباه است" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Verify password using SHA-256
    const isValid = await verifyPassword(password, admin.password_hash)
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "نام کاربری یا رمز عبور اشتباه است" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Generate a session token
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    // Hash the token for storage
    const encoder = new TextEncoder()
    const tokenHashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token))
    const tokenHash = Array.from(new Uint8Array(tokenHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    // Capture device info
    const userAgent = req.headers.get("User-Agent") || ""
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                      req.headers.get("x-real-ip") || ""

    // Store session (expires in 24 hours)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await supabaseAdmin.from("admin_sessions").insert({
      admin_id: admin.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      user_agent: userAgent,
      ip_address: ipAddress,
    })

    return new Response(
      JSON.stringify({
        message: "ورود مدیر با موفقیت انجام شد",
        token: token,
        admin: {
          id: admin.id,
          username: admin.username,
        },
        expires_at: expiresAt,
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
