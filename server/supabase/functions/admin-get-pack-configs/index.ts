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

    const { pack_id } = await req.json()

    if (!pack_id) {
      return new Response(JSON.stringify({ error: "شناسه بسته الزامی است" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Get pack info
    const { data: pack, error: packError } = await supabaseAdmin
      .from("config_packs")
      .select("id, pack_name, creator_name, assigned_to, assigned_at, created_at")
      .eq("id", pack_id)
      .single()

    if (packError || !pack) {
      return new Response(JSON.stringify({ error: "بسته مورد نظر یافت نشد" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Get configs in this pack
    const { data: configs, error: configsError } = await supabaseAdmin
      .from("vless_configs")
      .select("id, vless_uri, remark")
      .eq("pack_id", pack_id)
      .order("created_at", { ascending: true })

    if (configsError) {
      return new Response(JSON.stringify({ error: "خطا در دریافت کانفیگ‌ها" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Get assigned user email if any
    let assignedEmail = null
    if (pack.assigned_to) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(pack.assigned_to)
      if (userData?.user) {
        assignedEmail = userData.user.email
      }
    }

    return new Response(JSON.stringify({
      pack: {
        id: pack.id,
        pack_name: pack.pack_name,
        creator_name: pack.creator_name,
        assigned_to: pack.assigned_to,
        assigned_to_email: assignedEmail,
        assigned_at: pack.assigned_at,
        created_at: pack.created_at,
      },
      configs: (configs || []).map(c => ({
        id: c.id,
        vless_uri: c.vless_uri,
        remark: c.remark,
      })),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (error) {
    return new Response(JSON.stringify({ error: "خطای داخلی سرور" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
