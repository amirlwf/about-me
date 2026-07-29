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

    // Get config counts per pack using a single efficient query
    const { data: configCounts } = await supabaseAdmin
      .from("vless_configs")
      .select("pack_id")
      .not("pack_id", "is", null)

    const countMap: Record<string, number> = {}
    for (const c of (configCounts || [])) {
      countMap[c.pack_id] = (countMap[c.pack_id] || 0) + 1
    }

    // Get assigned user emails efficiently — use getUserById for each assigned user
    const assignedUserIds = packs
      ?.filter(p => p.assigned_to)
      .map(p => p.assigned_to) || []

    const userMap: Record<string, string> = {}
    // Fetch only assigned users (batched, max 10 parallel requests)
    const batchSize = 10
    for (let i = 0; i < assignedUserIds.length; i += batchSize) {
      const batch = assignedUserIds.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(id =>
          supabaseAdmin.auth.admin.getUserById(id)
            .then(res => ({ id, email: res.data?.user?.email || id }))
            .catch(() => ({ id, email: id }))
        )
      )
      for (const r of results) {
        userMap[r.id] = r.email
      }
    }

    // Build pack data
    const packList = (packs || []).map(pack => ({
      id: pack.id,
      pack_name: pack.pack_name,
      creator_name: pack.creator_name,
      config_count: countMap[pack.id] || 0,
      assigned_to: pack.assigned_to,
      assigned_to_email: pack.assigned_to ? (userMap[pack.assigned_to] || "نامشخص") : null,
      assigned_at: pack.assigned_at,
      created_at: pack.created_at,
    }))

    return new Response(JSON.stringify({ packs: packList }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: "خطای داخلی سرور" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
