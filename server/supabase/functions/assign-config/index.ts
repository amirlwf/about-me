import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

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
      try { params.set('remarks', decodeURIComponent(existingRemarks)) } catch { /* keep */ }
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
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "احراز هویت لازم است" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "احراز هویت نامعتبر" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Get user display name
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()

    const displayName = profile?.display_name || user.email?.split("@")[0] || "User"
    const personalizationTag = `${displayName}'s Config | amirlwf.ir`

    // ========================
    // STEP 1: Check if user already has a pack assigned
    // ========================
    const { data: existingPack } = await supabaseAdmin
      .from("config_packs")
      .select("id, pack_name, creator_name")
      .eq("assigned_to", user.id)
      .maybeSingle()

    if (existingPack) {
      // User already has a pack — refresh remarks and return it
      await supabaseAdmin
        .from("vless_configs")
        .update({ remark: personalizationTag })
        .eq("pack_id", existingPack.id)

      const { data: packConfigs } = await supabaseAdmin
        .from("vless_configs")
        .select("id, vless_uri")
        .eq("pack_id", existingPack.id)

      if (packConfigs && packConfigs.length > 0) {
        const configs = packConfigs.map(c => ({
          config_id: c.id,
          vless_uri: updateVlessRemarks(c.vless_uri, personalizationTag),
          remark: personalizationTag,
        }))

        return new Response(JSON.stringify({
          pack: { id: existingPack.id, name: existingPack.pack_name, creator: existingPack.creator_name },
          configs,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
    }

    // ========================
    // STEP 2: Try to assign an unassigned pack
    // ========================
    const { data: unassignedPack } = await supabaseAdmin
      .from("config_packs")
      .select("id, pack_name, creator_name")
      .is("assigned_to", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()  // ★ FIX: Use maybeSingle() so it returns null instead of throwing when no packs exist

    if (unassignedPack) {
      // Assign the pack to user atomically: verify pack is still unassigned before updating
      const now = new Date().toISOString()
      const { data: updatedPack, error: assignPackErr } = await supabaseAdmin
        .from("config_packs")
        .update({ assigned_to: user.id, assigned_at: now })
        .eq("id", unassignedPack.id)
        .is("assigned_to", null) // safety: only update if still unassigned
        .select("id")
        .single()

      if (!assignPackErr && updatedPack) {
        // ★ Only proceed if the UPDATE actually affected a row (prevents race conditions)
        await supabaseAdmin
          .from("vless_configs")
          .update({ assigned_to: user.id, assigned_at: now, remark: personalizationTag })
          .eq("pack_id", unassignedPack.id)

        const { data: packConfigs } = await supabaseAdmin
          .from("vless_configs")
          .select("id, vless_uri")
          .eq("pack_id", unassignedPack.id)

        if (packConfigs && packConfigs.length > 0) {
          const configs = packConfigs.map(c => ({
            config_id: c.id,
            vless_uri: updateVlessRemarks(c.vless_uri, personalizationTag),
            remark: personalizationTag,
          }))

          return new Response(JSON.stringify({
            pack: { id: unassignedPack.id, name: unassignedPack.pack_name, creator: unassignedPack.creator_name },
            configs,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
        }
      }
    }

    // ========================
    // STEP 3: Fallback — try to assign an individual config (old system)
    // ========================
    const { data: unassignedConfig } = await supabaseAdmin
      .from("vless_configs")
      .select("id, vless_uri")
      .is("assigned_to", null)
      .is("pack_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (unassignedConfig) {
      const now = new Date().toISOString()
      await supabaseAdmin
        .from("vless_configs")
        .update({ assigned_to: user.id, assigned_at: now, remark: personalizationTag })
        .eq("id", unassignedConfig.id)

      return new Response(JSON.stringify({
        pack: null,
        configs: [{
          config_id: unassignedConfig.id,
          vless_uri: updateVlessRemarks(unassignedConfig.vless_uri, personalizationTag),
          remark: personalizationTag,
        }],
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // No configs available at all
    return new Response(
      JSON.stringify({ error: "هیچ کانفیگی در دسترس نیست. لطفاً بعداً تلاش کنید" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "خطای داخلی سرور: " + (error.message || "unknown") }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
