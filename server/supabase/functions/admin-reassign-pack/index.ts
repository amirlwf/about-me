import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

async function verifyAdminSession(supabaseAdmin: any, token: string): Promise<{ valid: boolean; admin_id?: string }> {
  const encoder = new TextEncoder()
  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token))
  const tokenHash = Array.from(new Uint8Array(tokenHashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("")

  const { data: session, error } = await supabaseAdmin
    .from("admin_sessions").select("*").eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString()).single()

  if (error || !session) return { valid: false }
  return { valid: true, admin_id: session.admin_id }
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "احراز هویت مدیر لازم است" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const token = authHeader.replace("Bearer ", "")
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const session = await verifyAdminSession(supabaseAdmin, token)
    if (!session.valid) {
      return new Response(JSON.stringify({ error: "جلسه مدیر منقضی شده" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const { user_id, new_pack_id } = await req.json()

    if (!user_id || !new_pack_id) {
      return new Response(JSON.stringify({ error: "شناسه کاربر و شناسه بسته جدید الزامی است" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Get the user's display name for personalization
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("display_name")
      .eq("id", user_id)
      .single()

    const userEmail = user_id // fallback
    const displayName = profile?.display_name || "User"

    // 1. Find user's current pack and unassign it
    const { data: currentPack } = await supabaseAdmin
      .from("config_packs")
      .select("id")
      .eq("assigned_to", user_id)
      .maybeSingle()

    if (currentPack) {
      // Unassign old pack
      await supabaseAdmin
        .from("config_packs")
        .update({ assigned_to: null, assigned_at: null })
        .eq("id", currentPack.id)

      // Unassign all configs in old pack
      await supabaseAdmin
        .from("vless_configs")
        .update({ assigned_to: null, assigned_at: null })
        .eq("pack_id", currentPack.id)
    }

    // 2. Verify the new pack exists and is unassigned
    const { data: newPack, error: packError } = await supabaseAdmin
      .from("config_packs")
      .select("id, pack_name, creator_name")
      .eq("id", new_pack_id)
      .is("assigned_to", null)
      .single()

    if (packError || !newPack) {
      // Rollback: reassign old pack if we unassigned it
      if (currentPack) {
        await supabaseAdmin
          .from("config_packs")
          .update({ assigned_to: user_id, assigned_at: new Date().toISOString() })
          .eq("id", currentPack.id)
        await supabaseAdmin
          .from("vless_configs")
          .update({ assigned_to: user_id, assigned_at: new Date().toISOString() })
          .eq("pack_id", currentPack.id)
      }
      return new Response(JSON.stringify({ error: "بسته مورد نظر موجود نیست یا قبلاً تخصیص یافته" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // 3. Assign new pack to user
    await supabaseAdmin
      .from("config_packs")
      .update({ assigned_to: user_id, assigned_at: new Date().toISOString() })
      .eq("id", new_pack_id)

    // 4. Assign all configs in new pack to user
    const { data: newConfigs } = await supabaseAdmin
      .from("vless_configs")
      .select("id, vless_uri")
      .eq("pack_id", new_pack_id)

    // Personalize each config
    const personalizationTag = `${newPack.pack_name} | سازنده: ${newPack.creator_name} | کاربر: ${displayName} | Made by amirlwf.ir`

    for (const config of (newConfigs || [])) {
      await supabaseAdmin
        .from("vless_configs")
        .update({
          assigned_to: user_id,
          assigned_at: new Date().toISOString(),
          remark: personalizationTag,
          vless_uri: updateVlessRemarks(config.vless_uri, personalizationTag),
        })
        .eq("id", config.id)
    }

    return new Response(JSON.stringify({
      message: `✅ بسته "${newPack.pack_name}" با موفقیت به کاربر تخصیص یافت`,
      pack: { id: newPack.id, name: newPack.pack_name, creator: newPack.creator_name },
      configs_count: newConfigs?.length || 0,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (error) {
    return new Response(JSON.stringify({ error: "خطای داخلی سرور" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
