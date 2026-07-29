import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

/**
 * Parse a vless:// URI and update the remarks parameter.
 * vless:// format: vless://uuid@host:port?params#fragment
 * Since vless:// is not a standard URL protocol, we parse it manually.
 */
function updateVlessRemarks(uri: string, newRemarks: string): string {
  try {
    // Split at the first ? to separate base from query
    const questionIdx = uri.indexOf("?")
    if (questionIdx === -1) {
      // No query params, add remarks as the first param
      return uri + "?remarks=" + encodeURIComponent(newRemarks)
    }

    const base = uri.substring(0, questionIdx)
    let queryString = uri.substring(questionIdx + 1)

    // Remove fragment if present
    let fragment = ""
    const hashIdx = queryString.indexOf("#")
    if (hashIdx !== -1) {
      fragment = queryString.substring(hashIdx)
      queryString = queryString.substring(0, hashIdx)
    }

    // Parse existing params
    const params = new URLSearchParams(queryString)
    // Decode existing remarks to avoid double-encoding
    const existingRemarks = params.get('remarks')
    if (existingRemarks) {
      try {
        params.set('remarks', decodeURIComponent(existingRemarks))
      } catch {
        // keep as-is if decode fails
      }
    }

    // Set or replace remarks
    params.set("remarks", newRemarks)

    // Reconstruct
    return base + "?" + params.toString() + fragment
  } catch {
    return uri
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "احراز هویت لازم است" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Create client with user's JWT
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "احراز هویت نامعتبر" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Use admin client for the atomic assignment
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Get user profile for display name
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("display_name")
      .eq("id", user.id)
      .single()

    const displayName = profile?.display_name || user.email?.split("@")[0] || "User"

    // Call the atomic PostgreSQL function
    const { data: assignResult, error: assignError } = await supabaseAdmin.rpc(
      "assign_config_to_user",
      { p_user_id: user.id }
    )

    if (assignError) {
      if (assignError.message?.includes("NO_CONFIGS_AVAILABLE")) {
        return new Response(
          JSON.stringify({ error: "هیچ کانفیگی در دسترس نیست. لطفاً بعداً تلاش کنید" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
      return new Response(
        JSON.stringify({ error: "خطا در تخصیص کانفیگ" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (!assignResult || assignResult.length === 0) {
      return new Response(
        JSON.stringify({ error: "خطا در تخصیص کانفیگ" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const config = assignResult[0]

    // Personalize the config: append user name and brand tag to remark
    const personalizedRemark = `${config.remark} | ${displayName} | Made by amirlwf.ir`

    // Update the remark in the database
    await supabaseAdmin
      .from("vless_configs")
      .update({ remark: personalizedRemark })
      .eq("id", config.config_id)

    // Build the personalized vless URI using manual string parsing
    // (vless:// is not a standard URL protocol, so new URL() won't work)
    const personalizedUri = updateVlessRemarks(config.vless_uri, personalizedRemark)

    return new Response(
      JSON.stringify({
        config_id: config.config_id,
        vless_uri: personalizedUri,
        remark: personalizedRemark,
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
