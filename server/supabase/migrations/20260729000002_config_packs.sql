-- ============================================================
-- Config Packs — batch configs as a single assignable unit
-- ============================================================

-- 1. Config Packs table
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

-- 2. Add pack_id to vless_configs
ALTER TABLE public.vless_configs ADD COLUMN IF NOT EXISTS pack_id UUID REFERENCES public.config_packs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vless_configs_pack ON public.vless_configs (pack_id);

-- 3. Drop unique_assignment constraint (one user can have multiple configs from a pack)
ALTER TABLE public.vless_configs DROP CONSTRAINT IF EXISTS unique_assignment;

-- 4. RLS policies for config_packs
ALTER TABLE public.config_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assigned pack"
  ON public.config_packs FOR SELECT
  USING (assigned_to = auth.uid());

CREATE POLICY "Service role full access to config_packs"
  ON public.config_packs FOR ALL
  USING (true);

-- 5. RLS policy update for vless_configs — allow users to see configs in their pack
DROP POLICY IF EXISTS "Users can view own assigned config" ON public.vless_configs;
CREATE POLICY "Users can view own assigned config"
  ON public.vless_configs FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR
    pack_id IN (SELECT id FROM public.config_packs WHERE assigned_to = auth.uid())
  );

-- 6. Atomic pack assignment function
CREATE OR REPLACE FUNCTION public.assign_pack_to_user(p_user_id UUID)
RETURNS TABLE(pack_id UUID, pack_name TEXT, creator_name TEXT) AS $$
DECLARE
  v_pack RECORD;
BEGIN
  -- Check if user already has a pack
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

  -- Lock and assign an unassigned pack (atomic, prevents race conditions)
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

  -- Assign pack to user
  UPDATE public.config_packs
  SET assigned_to = p_user_id,
      assigned_at = NOW()
  WHERE id = v_pack.id;

  -- Also update assigned_to on all configs in this pack (for backward compat / direct queries)
  UPDATE public.vless_configs
  SET assigned_to = p_user_id,
      assigned_at = NOW()
  WHERE pack_id = v_pack.id;

  pack_id := v_pack.id;
  pack_name := v_pack.pack_name;
  creator_name := v_pack.creator_name;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
