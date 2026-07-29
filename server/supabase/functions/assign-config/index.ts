import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

/**
 * Parse a vless:// URI and update the remarks parameter.
 * vless:// format: vless://uuid@host:port?params#fragment
 */
function updateVlessRemarks(uri: string, newRemarks: string): string {
  try {
    const questionIdx = uri.indexOf("?")
    if (questionIdx === -1) {
      return uri + "?remarks=" + encodeURIComponent(newRemarks)
    }

    const base = uri.substring(0, questionIdx)
    let queryString = uri.substring(questionIdx + 1)

    let fragment = ""
    const hashIdx = queryString.indexOf("#")
    if (hashIdx !== -1) {
      fragment = queryString.substring(hashIdx)
      queryString = queryString.substring(0, hashIdx)
    }

    const params = new URLSearchParams(queryString)
    const existingRemarks = params.get('remarks')
    if (existingRemarks) {
      try {
        params.set('remarks', decodeURIComponent(existingRemarks))
      } catch {
        // keep as-is
      }
    }

    params.set("remarks", newRemarks)
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

    // ----- TRY PACK ASSIGNMENT FIRST (new system) -----
    const { data: packAssignResult, error: packAssignError } = await supabaseAdmin.rpc(
      "assign_pack_to_user",
      { p_user_id: user.id }
    )

    if (packAssignError) {
      // If no packs available OR the RPC doesn't exist yet (migration not applied),
      // fall back to individual config assignment for backward compatibility
      const isFallbackCase = packAssignError.message?.includes("NO_PACKS_AVAILABLE") ||
                             packAssignError.message?.includes("does not exist") ||
                             packAssignError.message?.includes("relation") ||
                             packAssignError.message?.includes("not found");
      if (!isFallbackCase) {
        return new Response(
          JSON.stringify({ error: "خطا در تخصیص بسته کانفیگ" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // ----- FALLBACK: Individual config assignment (old system) -----
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
      const personalizedRemark = `${config.remark} | ${displayName} | Made by amirlwf.ir`
      await supabaseAdmin
        .from("vless_configs")
        .update({ remark: personalizedRemark })
        .eq("id", config.config_id)

      const personalizedUri = updateVlessRemarks(config.vless_uri, personalizedRemark)

      return new Response(
        JSON.stringify({
          pack: null, // No pack — single config fallback
          configs: [{
            config_id: config.config_id,
            vless_uri: personalizedUri,
            remark: personalizedRemark,
          }],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ----- PACK ASSIGNED SUCCESSFULLY -----
    const packInfo = packAssignResult[0]

    // Fetch all configs in this pack
    const { data: packConfigs, error: configsError } = await supabaseAdmin
      .from("vless_configs")
      .select("id, vless_uri, remark")
      .eq("pack_id", packInfo.pack_id)

    if (configsError || !packConfigs || packConfigs.length === 0) {
      return new Response(
        JSON.stringify({ error: "خطا در دریافت کانفیگ‌های بسته" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Personalize each config's remark: "پک نام | سازنده: نام | کاربر: نام | Made by amirlwf.ir"
    const personalizationTag = `${packInfo.pack_name} | سازنده: ${packInfo.creator_name} | کاربر: ${displayName} | Made by amirlwf.ir`

    const personalizedConfigs = await Promise.all(
      packConfigs.map(async (config: any) => {
        await supabaseAdmin
          .from("vless_configs")
          .update({ remark: personalizationTag })
          .eq("id", config.id)

        return {
          config_id: config.id,
          vless_uri: updateVlessRemarks(config.vless_uri, personalizationTag),
          remark: personalizationTag,
        }
      })
    )

    return new Response(
      JSON.stringify({
        pack: {
          id: packInfo.pack_id,
          name: packInfo.pack_name,
          creator: packInfo.creator_name,
        },
        configs: personalizedConfigs,
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
