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

    // Get all users from auth.users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers()

    if (authError) {
      return new Response(
        JSON.stringify({ error: "خطا در دریافت لیست کاربران" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Get all profiles
    const { data: profiles } = await supabaseAdmin
      .from("user_profiles")
      .select("*")

    // Get all assigned configs
    const { data: configs } = await supabaseAdmin
      .from("vless_configs")
      .select("id, vless_uri, remark, assigned_to, assigned_at")
      .not("assigned_to", "is", null)

    // Combine data
    const users = authUsers.users.map((authUser: any) => {
      const profile = profiles?.find((p: any) => p.id === authUser.id)
      const config = configs?.find((c: any) => c.assigned_to === authUser.id)

      return {
        id: authUser.id,
        email: authUser.email,
        display_name: profile?.display_name || authUser.user_metadata?.display_name || "",
        created_at: authUser.created_at,
        config: config
          ? {
              id: config.id,
              remark: config.remark,
              assigned_at: config.assigned_at,
            }
          : null,
      }
    })

    // Get pool stats
    const { count: totalConfigs } = await supabaseAdmin
      .from("vless_configs")
      .select("*", { count: "exact", head: true })

    const { count: unassignedConfigs } = await supabaseAdmin
      .from("vless_configs")
      .select("*", { count: "exact", head: true })
      .is("assigned_to", null)

    return new Response(
      JSON.stringify({
        users: users,
        stats: {
          total_users: users.length,
          total_configs: totalConfigs || 0,
          unassigned_configs: unassignedConfigs || 0,
          assigned_configs: (totalConfigs || 0) - (unassignedConfigs || 0),
        },
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
