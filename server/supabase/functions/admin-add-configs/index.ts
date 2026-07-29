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

    const { configs, pack_name, creator_name } = await req.json()

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return new Response(
        JSON.stringify({ error: "لیست کانفیگ‌ها الزامی است" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Filter valid VLESS URIs
    const entries = configs
      .map((line: string) => line.trim())
      .filter((line: string) => line.startsWith("vless://"))

    if (entries.length === 0) {
      return new Response(
        JSON.stringify({ error: "هیچ کانفیگ vless معتبری یافت نشد" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const finalPackName = (pack_name || "").trim() || `پک ${new Date().toLocaleDateString("fa-IR")}`
    const finalCreatorName = (creator_name || "").trim() || "مدیر سیستم"

    // 1. Create the config pack
    const { data: pack, error: packError } = await supabaseAdmin
      .from("config_packs")
      .insert({
        pack_name: finalPackName,
        creator_name: finalCreatorName,
      })
      .select("id, pack_name, creator_name")
      .single()

    if (packError || !pack) {
      return new Response(
        JSON.stringify({ error: "خطا در ایجاد بسته کانفیگ" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 2. Insert all configs with the pack_id
    const configRows = entries.map((uri: string) => ({
      vless_uri: uri,
      remark: finalPackName,
      pack_id: pack.id,
    }))

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("vless_configs")
      .insert(configRows)
      .select("id")

    if (insertError) {
      // Clean up the pack if insert failed
      await supabaseAdmin.from("config_packs").delete().eq("id", pack.id)
      return new Response(
        JSON.stringify({ error: "خطا در ذخیره کانفیگ‌ها" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({
        message: `✅ بسته "${finalPackName}" با ${entries.length} کانفیگ با موفقیت اضافه شد`,
        count: entries.length,
        pack: {
          id: pack.id,
          name: finalPackName,
          creator: finalCreatorName,
        },
        ids: inserted?.map((d: any) => d.id) || [],
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
