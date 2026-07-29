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
    if (questionIdx === -1) return uri + "?remarks=" + encodeURIComponent(newRemarks)

    const base = uri.substring(0, questionIdx)
    let queryString = uri.substring(questionIdx + 1)
    let fragment = ""
    const hashIdx = queryString.indexOf("#")
    if (hashIdx !== -1) { fragment = queryString.substring(hashIdx); queryString = queryString.substring(0, hashIdx) }

    const params = new URLSearchParams(queryString)
    const existingRemarks = params.get('remarks')
    if (existingRemarks) { try { params.set('remarks', decodeURIComponent(existingRemarks)) } catch {} }
    params.set("remarks", newRemarks)
    return base + "?" + params.toString() + fragment
  } catch { return uri }
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

    const { pack_id, configs, pack_name, creator_name } = await req.json()

    if (!pack_id) {
      return new Response(JSON.stringify({ error: "شناسه بسته الزامی است" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Verify pack exists
    const { data: pack, error: packError } = await supabaseAdmin
      .from("config_packs")
      .select("id, pack_name, creator_name, assigned_to")
      .eq("id", pack_id)
      .single()

    if (packError || !pack) {
      return new Response(JSON.stringify({ error: "بسته مورد نظر یافت نشد" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Update pack metadata if provided
    const finalPackName = (pack_name || "").trim() || pack.pack_name
    const finalCreatorName = (creator_name || "").trim() || pack.creator_name

    if (finalPackName !== pack.pack_name || finalCreatorName !== pack.creator_name) {
      await supabaseAdmin
        .from("config_packs")
        .update({ pack_name: finalPackName, creator_name: finalCreatorName })
        .eq("id", pack_id)
    }

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return new Response(JSON.stringify({
        message: `✅ اطلاعات بسته "${finalPackName}" با موفقیت به‌روز شد`,
        count: 0,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Filter valid VLESS URIs
    const entries = configs
      .map((line: string) => line.trim())
      .filter((line: string) => line.startsWith("vless://"))

    if (entries.length === 0) {
      return new Response(JSON.stringify({ error: "هیچ کانفیگ vless معتبری یافت نشد" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Get existing configs for this pack
    const { data: existingConfigs } = await supabaseAdmin
      .from("vless_configs")
      .select("id, vless_uri")
      .eq("pack_id", pack_id)
      .order("created_at", { ascending: true })

    // Build the personalization tag if pack is assigned
    let personalizationTag = finalPackName
    if (pack.assigned_to) {
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("display_name")
        .eq("id", pack.assigned_to)
        .single()

      const displayName = profile?.display_name || "User"
      personalizationTag = `${displayName}'s Config | amirlwf.ir`
    }

    // Update existing configs or insert new ones
    const now = new Date().toISOString()

    if (existingConfigs && existingConfigs.length > 0) {
      // Update each existing config with new URIs (up to the count of existing)
      for (let i = 0; i < Math.min(existingConfigs.length, entries.length); i++) {
        const updatedUri = personalizationTag !== finalPackName
          ? updateVlessRemarks(entries[i], personalizationTag)
          : entries[i]

        await supabaseAdmin
          .from("vless_configs")
          .update({
            vless_uri: updatedUri,
            remark: personalizationTag,
          })
          .eq("id", existingConfigs[i].id)
      }

      // If more new URIs than existing configs, insert additional rows
      if (entries.length > existingConfigs.length) {
        const newRows = entries.slice(existingConfigs.length).map(uri => ({
          vless_uri: personalizationTag !== finalPackName
            ? updateVlessRemarks(uri, personalizationTag)
            : uri,
          remark: personalizationTag,
          pack_id: pack_id,
          assigned_to: pack.assigned_to,
          assigned_at: pack.assigned_to ? now : null,
        }))
        await supabaseAdmin.from("vless_configs").insert(newRows)
      }

      // If fewer new URIs than existing configs, delete the extras
      if (entries.length < existingConfigs.length) {
        const extraIds = existingConfigs.slice(entries.length).map(c => c.id)
        await supabaseAdmin.from("vless_configs").delete().in("id", extraIds)
      }
    } else {
      // No existing configs — insert all
      const newRows = entries.map(uri => ({
        vless_uri: personalizationTag !== finalPackName
          ? updateVlessRemarks(uri, personalizationTag)
          : uri,
        remark: personalizationTag,
        pack_id: pack_id,
        assigned_to: pack.assigned_to,
        assigned_at: pack.assigned_to ? now : null,
      }))
      await supabaseAdmin.from("vless_configs").insert(newRows)
    }

    return new Response(JSON.stringify({
      message: `✅ کانفیگ‌های بسته "${finalPackName}" با موفقیت به‌روز شد (${entries.length} کانفیگ)`,
      count: entries.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (error) {
    return new Response(JSON.stringify({ error: "خطای داخلی سرور" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
