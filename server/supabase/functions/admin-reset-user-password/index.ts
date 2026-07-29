import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const { email, new_password } = await req.json()

    if (!email || !new_password) {
      return new Response(
        JSON.stringify({ error: "ایمیل کاربر و رمز عبور جدید الزامی هستند" }),
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
      .select("admin_id")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .single()

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "جلسه مدیر منقضی شده" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Look up user by email using auth admin API
    const { data: userData, error: userLookupError } = await supabaseAdmin.auth.admin.listUsers()

    if (userLookupError) {
      return new Response(
        JSON.stringify({ error: "خطا در دریافت لیست کاربران" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Find user by email
    const user = userData.users.find(u => u.email === email)
    if (!user) {
      return new Response(
        JSON.stringify({ error: "کاربری با این ایمیل یافت نشد" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Reset user password using Supabase Auth Admin API
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: new_password }
    )

    if (error) {
      return new Response(
        JSON.stringify({ error: "خطا در تغییر رمز عبور کاربر: " + error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ 
        message: "رمز عبور کاربر با موفقیت تغییر کرد",
        user_id: data.user.id
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