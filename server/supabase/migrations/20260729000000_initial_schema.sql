-- ============================================================
-- VLESS Config Distribution System - Initial Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USER PROFILES (extends Supabase Auth users)
-- ============================================================
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. VLESS CONFIGS POOL
-- ============================================================
CREATE TABLE public.vless_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vless_uri TEXT NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_assignment UNIQUE (assigned_to)
);

CREATE INDEX idx_vless_configs_unassigned ON public.vless_configs (assigned_to) WHERE assigned_to IS NULL;
CREATE INDEX idx_vless_configs_assigned_to ON public.vless_configs (assigned_to);

-- ============================================================
-- 3. ENTRY CODES (one-time, time-limited)
-- ============================================================
CREATE TABLE public.entry_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entry_codes_code ON public.entry_codes (code);
CREATE INDEX idx_entry_codes_active ON public.entry_codes (is_active, expires_at) WHERE is_active = TRUE AND used_by IS NULL;

-- ============================================================
-- 4. ADMIN USERS (password stored as SHA-256 hex hash)
-- ============================================================
CREATE TABLE public.admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default admin: username='admin', password='admin123'
-- SHA-256 hash of 'admin123_salt_vless_admin' = precomputed below
-- Generate your own: echo -n 'yourpassword_salt_vless_admin' | sha256sum
INSERT INTO public.admin_users (username, password_hash)
VALUES ('admin', '5c1ae31b16b2d99c33d999b0e7450704c6f98077d04503d737a4192d0e86dbdb');

-- ============================================================
-- 5. TUTORIAL VIDEOS
-- ============================================================
CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  video_url TEXT NOT NULL,
  thumbnail_url TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_videos_active ON public.videos (is_active, sort_order) WHERE is_active = TRUE;

-- ============================================================
-- 6. ADMIN SESSIONS (for admin JWT-like tokens)
-- ============================================================
CREATE TABLE public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_sessions_token ON public.admin_sessions (token_hash);
CREATE INDEX idx_admin_sessions_expiry ON public.admin_sessions (expires_at);

-- ============================================================
-- 7. RATE LIMITING TABLE
-- ============================================================
CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL,
  action TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_rate_limit UNIQUE (identifier, action)
);

CREATE INDEX idx_rate_limits_lookup ON public.rate_limits (identifier, action, window_start);

-- ============================================================
-- 8. ATOMIC CONFIG ASSIGNMENT FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_config_to_user(p_user_id UUID)
RETURNS TABLE(config_id UUID, vless_uri TEXT, remark TEXT) AS $$
DECLARE
  v_config RECORD;
BEGIN
  -- Check if user already has a config
  SELECT vc.id, vc.vless_uri, vc.remark
  INTO v_config
  FROM public.vless_configs vc
  WHERE vc.assigned_to = p_user_id
  LIMIT 1;

  IF FOUND THEN
    config_id := v_config.id;
    vless_uri := v_config.vless_uri;
    remark := v_config.remark;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock and assign an unassigned config (atomic, prevents race conditions)
  SELECT vc.id, vc.vless_uri, vc.remark
  INTO v_config
  FROM public.vless_configs vc
  WHERE vc.assigned_to IS NULL
  ORDER BY vc.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_CONFIGS_AVAILABLE: No VLESS configs available in the pool';
  END IF;

  -- Assign config to user
  UPDATE public.vless_configs
  SET assigned_to = p_user_id,
      assigned_at = NOW()
  WHERE id = v_config.id;

  config_id := v_config.id;
  vless_uri := v_config.vless_uri;
  remark := v_config.remark;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. RATE LIMIT CHECK FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_window_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN AS $$
DECLARE
  v_record RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get or create rate limit record
  INSERT INTO public.rate_limits (identifier, action, attempts, window_start)
  VALUES (p_identifier, p_action, 1, v_now)
  ON CONFLICT (identifier, action) DO UPDATE
  SET attempts = CASE
    WHEN rate_limits.window_start < v_now - (p_window_seconds || ' seconds')::INTERVAL
    THEN 1
    ELSE rate_limits.attempts + 1
  END,
  window_start = CASE
    WHEN rate_limits.window_start < v_now - (p_window_seconds || ' seconds')::INTERVAL
    THEN v_now
    ELSE rate_limits.window_start
  END
  RETURNING * INTO v_record;

  -- Check if rate limit exceeded
  IF v_record.attempts > p_max_attempts THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- User Profiles: users can only read/update their own profile
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- INSERT is handled by the SECURITY DEFINER trigger (bypasses RLS)
-- No INSERT policy needed for users — the trigger creates profiles server-side

-- VLESS Configs: users can only see their own assigned config
ALTER TABLE public.vless_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assigned config"
  ON public.vless_configs FOR SELECT
  USING (assigned_to = auth.uid());

CREATE POLICY "Service role full access to configs"
  ON public.vless_configs FOR ALL
  USING (true);

-- Entry Codes: no direct user access (all via Edge Functions)
ALTER TABLE public.entry_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to entry codes"
  ON public.entry_codes FOR ALL
  USING (false);

-- Admin Users: no direct access
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to admin users"
  ON public.admin_users FOR ALL
  USING (false);

-- Videos: anyone can read active videos (used by both dashboard users and admin panel)
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active videos"
  ON public.videos FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Service role full access to videos"
  ON public.videos FOR ALL
  USING (true);

-- Admin Sessions: no direct access
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to admin sessions"
  ON public.admin_sessions FOR ALL
  USING (false);

-- Rate Limits: no direct access
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to rate limits"
  ON public.rate_limits FOR ALL
  USING (false);

-- ============================================================
-- 11. UPDATED AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
