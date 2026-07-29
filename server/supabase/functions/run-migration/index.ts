import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req: Request) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // SQL for is_banned migration (20260729000001)
    const sqlBanned = `
      ALTER TABLE public.user_profiles 
      ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
    `

    // SQL for config_packs migration (20260729000002)
    const sqlPacks = `
      CREATE TABLE IF NOT EXISTS public.config_packs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        pack_name TEXT NOT NULL DEFAULT '',
        creator_name TEXT NOT NULL DEFAULT '',
        assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_config_packs_unassigned ON public.config_packs (assigned_to) WHERE assigned_to IS NULL;
      CREATE INDEX IF NOT EXISTS idx_config_packs_assigned ON public.config_packs (assigned_to);

      ALTER TABLE public.vless_configs ADD COLUMN IF NOT EXISTS pack_id UUID REFERENCES public.config_packs(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_vless_configs_pack ON public.vless_configs (pack_id);

      ALTER TABLE public.vless_configs DROP CONSTRAINT IF EXISTS unique_assignment;

      ALTER TABLE public.config_packs ENABLE ROW LEVEL SECURITY;

      CREATE POLICY IF NOT EXISTS "Users can view own assigned pack"
        ON public.config_packs FOR SELECT
        USING (assigned_to = auth.uid());

      CREATE POLICY IF NOT EXISTS "Service role full access to config_packs"
        ON public.config_packs FOR ALL
        USING (true);

      DROP POLICY IF EXISTS "Users can view own assigned config" ON public.vless_configs;
      CREATE POLICY "Users can view own assigned config"
        ON public.vless_configs FOR SELECT
        USING (
          assigned_to = auth.uid()
          OR
          pack_id IN (SELECT id FROM public.config_packs WHERE assigned_to = auth.uid())
        );

      CREATE OR REPLACE FUNCTION public.assign_pack_to_user(p_user_id UUID)
      RETURNS TABLE(pack_id UUID, pack_name TEXT, creator_name TEXT) AS $func$
      DECLARE
        v_pack RECORD;
      BEGIN
        SELECT cp.id, cp.pack_name, cp.creator_name
        INTO v_pack
        FROM public.config_packs cp
        WHERE cp.assigned_to = p_user_id
        LIMIT 1;

        IF FOUND THEN
          pack_id := v_pack.id;
          pack_name := v_pack.pack_name;
          creator_name := v_pack.creator_name;
          RETURN NEXT;
          RETURN;
        END IF;

        SELECT cp.id, cp.pack_name, cp.creator_name
        INTO v_pack
        FROM public.config_packs cp
        WHERE cp.assigned_to IS NULL
        ORDER BY cp.created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'NO_PACKS_AVAILABLE: No config packs available in the pool';
        END IF;

        UPDATE public.config_packs
        SET assigned_to = p_user_id, assigned_at = NOW()
        WHERE id = v_pack.id;

        UPDATE public.vless_configs
        SET assigned_to = p_user_id, assigned_at = NOW()
        WHERE pack_id = v_pack.id;

        pack_id := v_pack.id;
        pack_name := v_pack.pack_name;
        creator_name := v_pack.creator_name;
        RETURN NEXT;
      END;
      $func$ LANGUAGE plpgsql SECURITY DEFINER;
    `

    // Run is_banned migration
    const { error: err1 } = await supabaseAdmin.rpc("exec_sql", { query: sqlBanned })
    if (err1 && !err1.message?.includes("already exists")) {
      console.log("is_banned migration note:", err1.message)
    }

    // Try running via raw SQL
    const { error: err2 } = await supabaseAdmin.from("_dummy").select("*").limit(0)
    
    // Use the rest API directly (bypasses rpc restrictions)
    const results = []
    
    // Execute via direct SQL API approach
    for (const sql of [sqlBanned, sqlPacks]) {
      const { error } = await supabaseAdmin.rpc("exec_sql", { query: sql })
      if (error) {
        results.push({ error: error.message })
      } else {
        results.push({ success: true })
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
