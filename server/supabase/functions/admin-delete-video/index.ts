import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

async function verifyAdminSession(supabaseAdmin: any, token: string): Promise<{ valid: boolean; admin_id?: string }> {
  const encoder = new TextEncoder()
  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token))
  const tokenHash = Array.from(new Uint8Array(tokenHashBuffer))
    .map((b) => b.toString(16).padStart(2, "0")).join("")

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

    const { video_id } = await req.json()
    if (!video_id) {
      return new Response(JSON.stringify({ error: "شناسه ویدیو الزامی است" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Get video to find storage path
    const { data: video } = await supabaseAdmin.from("videos").select("*").eq("id", video_id).single()
    if (!video) {
      return new Response(JSON.stringify({ error: "ویدیو یافت نشد" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // If video is stored in Supabase Storage, delete the file
    if (video.video_url && video.video_url.includes(supabaseAdmin.storage.from("videos").getPublicUrl("").data?.publicUrl || "")) {
      try {
        const urlObj = new URL(video.video_url)
        const pathParts = urlObj.pathname.split("/")
        const filePath = pathParts.slice(pathParts.indexOf("videos") + 1).join("/")
        if (filePath) {
          await supabaseAdmin.storage.from("videos").remove([filePath])
        }
      } catch { /* ignore storage deletion errors */ }
    }

    // Delete from database
    const { error: deleteError } = await supabaseAdmin.from("videos").delete().eq("id", video_id)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ message: "ویدیو با موفقیت حذف شد" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (error) {
    return new Response(JSON.stringify({ error: "خطا در حذف ویدیو: " + (error.message || "خطای ناشناخته") }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
