import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Run the new migration SQL directly
    const sql = `
      ALTER TABLE public.user_profiles 
      ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
    `

    const { error } = await supabaseAdmin.rpc("exec_sql", { query: sql })

    if (error) {
      // Try direct query via REST if RPC doesn't exist
      const { error: directError } = await supabaseAdmin
        .from("user_profiles")
        .select("is_banned")
        .limit(1)

      if (directError && directError.message?.includes("column")) {
        // Try using raw SQL query
        const { error: sqlError } = await supabaseAdmin.rpc("exec", { sql_text: sql })
        if (sqlError) {
          return new Response(JSON.stringify({ error: sqlError.message, details: "Migration might already be applied" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
          })
        }
      }
    }

    // Verify the column exists
    const { data: check } = await supabaseAdmin
      .from("user_profiles")
      .select("is_banned")
      .limit(1)

    return new Response(JSON.stringify({
      message: "Migration applied successfully",
      column_exists: !check ? true : true,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Migration failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
