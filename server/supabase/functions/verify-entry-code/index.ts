import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { email, password, entry_code, display_name } = await req.json()

    // Validate inputs
    if (!email || !password || !entry_code) {
      return new Response(
        JSON.stringify({ error: "ایمیل، رمز عبور و کد ورود الزامی هستند" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Rate limit check
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: rateCheck } = await supabaseAdmin.rpc("check_rate_limit", {
      p_identifier: email,
      p_action: "verify_entry_code",
      p_max_attempts: 5,
      p_window_seconds: 300,
    })

    if (rateCheck === false) {
      return new Response(
        JSON.stringify({ error: "تعداد تلاش‌ها بیش از حد مجاز است. لطفاً ۵ دقیقه صبر کنید" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Find and validate the entry code
    const { data: codeRecord, error: codeError } = await supabaseAdmin
      .from("entry_codes")
      .select("*")
      .eq("code", entry_code.trim())
      .eq("is_active", true)
      .is("used_by", null)
      .single()

    if (codeError || !codeRecord) {
      return new Response(
        JSON.stringify({ error: "کد ورود نامعتبر است" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Check expiry
    if (new Date(codeRecord.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "کد ورود منقضی شده است" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Create the user account via Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: password,
      email_confirm: true,
      user_metadata: {
        display_name: display_name || email.split("@")[0],
      },
    })

    if (authError) {
      if (authError.message?.includes("already registered")) {
        return new Response(
          JSON.stringify({ error: "این ایمیل قبلاً ثبت‌نام شده است. لطفاً وارد شوید" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
      return new Response(
        JSON.stringify({ error: "خطا در ایجاد حساب کاربری" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Mark the entry code as used
    await supabaseAdmin
      .from("entry_codes")
      .update({
        used_by: authData.user.id,
        used_at: new Date().toISOString(),
      })
      .eq("id", codeRecord.id)

    // Update profile display name if provided
    if (display_name) {
      await supabaseAdmin
        .from("user_profiles")
        .update({ display_name: display_name.trim() })
        .eq("id", authData.user.id)
    }

    // Sign in the user to get a session
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    )

    const { data: sessionData, error: sessionError } = await supabaseClient.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    })

    if (sessionError) {
      return new Response(
        JSON.stringify({ error: "حساب ساخته شد اما ورود ناموفق بود. لطفاً دوباره وارد شوید" }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({
        message: "ثبت‌نام و ورود با موفقیت انجام شد",
        user: {
          id: authData.user.id,
          email: authData.user.email,
          display_name: display_name || email.split("@")[0],
        },
        session: sessionData.session,
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
