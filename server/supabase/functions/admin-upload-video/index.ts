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

    const contentType = req.headers.get("Content-Type") || ""

    // Handle URL-based video (YouTube/Vimeo embed)
    if (contentType.includes("application/json")) {
      const { title, description, video_url, thumbnail_url, sort_order } = await req.json()

      if (!video_url || !title) {
        return new Response(
          JSON.stringify({ error: "عنوان و آدرس ویدیو الزامی هستند" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const { data, error } = await supabaseAdmin
        .from("videos")
        .insert({
          title: title.trim(),
          description: description?.trim() || "",
          video_url: video_url.trim(),
          thumbnail_url: thumbnail_url?.trim() || "",
          sort_order: sort_order || 0,
          is_active: true,
        })
        .select()
        .single()

      if (error) {
        return new Response(
          JSON.stringify({ error: "خطا در ذخیره ویدیو" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      return new Response(
        JSON.stringify({
          message: "ویدیو با موفقیت اضافه شد",
          video: data,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Handle file upload
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData()
      const file = formData.get("video") as File
      const title = formData.get("title") as string
      const description = formData.get("description") as string
      const sortOrder = parseInt(formData.get("sort_order") as string || "0")

      if (!file || !title) {
        return new Response(
          JSON.stringify({ error: "فایل ویدیو و عنوان الزامی هستند" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // Upload to Supabase Storage
      const fileExt = file.name.split(".").pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `tutorial-videos/${fileName}`

      const { error: uploadError } = await supabaseAdmin.storage
        .from("videos")
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        return new Response(
          JSON.stringify({ error: "خطا در آپلود فایل" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from("videos")
        .getPublicUrl(filePath)

      // Save metadata
      const { data, error } = await supabaseAdmin
        .from("videos")
        .insert({
          title: title.trim(),
          description: description?.trim() || "",
          video_url: urlData.publicUrl,
          thumbnail_url: "",
          sort_order: sortOrder,
          is_active: true,
        })
        .select()
        .single()

      if (error) {
        return new Response(
          JSON.stringify({ error: "خطا در ذخیره اطلاعات ویدیو" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      return new Response(
        JSON.stringify({
          message: "ویدیو با موفقیت آپلود شد",
          video: data,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ error: "فرمت درخواست نامعتبر" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "خطای داخلی سرور" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
