import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// SHA-256 hash helper
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + "_salt_vless_admin")
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const token = authHeader.replace("Bearer ", "")
    const { current_password, new_password } = await req.json()

    if (!current_password || !new_password) {
      return new Response(
        JSON.stringify({ error: "رمز عبور فعلی و رمز عبور جدید الزامی هستند" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (new_password.length < 6) {
      return new Response(
        JSON.stringify({ error: "رمز عبور جدید باید حداقل ۶ کاراکتر باشد" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Verify admin session
    const encoder = new TextEncoder()
    const tokenHashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token))
    const tokenHash = Array.from(new Uint8Array(tokenHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("admin_sessions")
      .select("admin_id, expires_at")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .single()

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "جلسه مدیر منقضی شده" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Get admin user
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admin_users")
      .select("*")
      .eq("id", session.admin_id)
      .single()

    if (adminError || !admin) {
      return new Response(
        JSON.stringify({ error: "کاربر مدیر یافت نشد" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Verify current password
    const currentHash = await hashPassword(current_password)
    if (currentHash !== admin.password_hash) {
      return new Response(
        JSON.stringify({ error: "رمز عبور فعلی اشتباه است" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Hash new password
    const newHash = await hashPassword(new_password)

    // Update password
    const { error: updateError } = await supabaseAdmin
      .from("admin_users")
      .update({ password_hash: newHash })
      .eq("id", admin.id)

    if (updateError) {
      throw updateError
    }

    // Invalidate all existing sessions for this admin
    await supabaseAdmin
      .from("admin_sessions")
      .delete()
      .eq("admin_id", admin.id)

    return new Response(
      JSON.stringify({ message: "رمز عبور با موفقیت تغییر کرد. لطفاً دوباره وارد شوید." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "خطای داخلی سرور" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
