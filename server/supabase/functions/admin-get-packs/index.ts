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

    // Get all packs with config count
    const { data: packs, error: packsError } = await supabaseAdmin
      .from("config_packs")
      .select("id, pack_name, creator_name, assigned_to, assigned_at, created_at")
      .order("created_at", { ascending: false })

    if (packsError) {
      return new Response(JSON.stringify({ error: "خطا در دریافت بسته‌ها" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Get config counts per pack
    const { data: configCounts } = await supabaseAdmin
      .from("vless_configs")
      .select("pack_id, id")
      .not("pack_id", "is", null)

    // Get assigned user emails
    const assignedUserIds = packs
      ?.filter(p => p.assigned_to)
      .map(p => p.assigned_to) || []

    let userMap: Record<string, string> = {}
    if (assignedUserIds.length > 0) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers()
      if (users?.users) {
        for (const u of users.users) {
          userMap[u.id] = u.email || u.id
        }
      }
    }

    // Build pack data
    const packList = (packs || []).map(pack => {
      const packConfigs = configCounts?.filter(c => c.pack_id === pack.id) || []
      return {
        id: pack.id,
        pack_name: pack.pack_name,
        creator_name: pack.creator_name,
        config_count: packConfigs.length,
        assigned_to: pack.assigned_to,
        assigned_to_email: pack.assigned_to ? (userMap[pack.assigned_to] || "نامشخص") : null,
        assigned_at: pack.assigned_at,
        created_at: pack.created_at,
      }
    })

    return new Response(JSON.stringify({ packs: packList }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: "خطای داخلی سرور" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
