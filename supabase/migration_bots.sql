-- ============================================================
-- migration_bots.sql — Telegram bot credentials managed from the admin panel
-- Run ONCE in Dashboard > SQL Editor (idempotent-safe).
--
-- Three bots, each with its own token + chat id:
--   chat       -> live chat (/fa/callme/ + /callme/) notifications
--   orders_fa  -> customer info from the PERSIAN section
--   orders_en  -> customer info from the ENGLISH section
--
-- SECURITY: tokens are SECRET. anon has no access at all (revoke + RLS),
-- only the admin panel (authenticated + user_metadata.role='admin') can
-- read/write, and Edge Functions read them with service_role.
-- Env secrets (FA_BOT_TOKEN, CHAT_BOT_TOKEN …) stay as fallback, so the
-- functions keep working before the panel is filled in.
-- ============================================================

create table if not exists public.bot_config (
  id         text primary key check (id in ('chat', 'orders_fa', 'orders_en')),
  label      text not null default '',
  bot_token  text,                 -- "123456:AA..." from @BotFather
  chat_id    text,                 -- target chat (e.g. 8376494566 or -100…)
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.bot_config enable row level security;

-- no anon/other-role access at all (belt) …
revoke all on public.bot_config from anon;
grant select, insert, update, delete on public.bot_config to authenticated;

-- … and RLS only lets the admin role (suspenders)
drop policy if exists bot_config_admin_all on public.bot_config;
create policy bot_config_admin_all on public.bot_config
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- the three bots (never overwrites a configured row)
insert into public.bot_config (id, label, enabled) values
  ('chat',      'بات گفت‌وگوی زنده',        false),
  ('orders_fa', 'بات اطلاعات مشتری (فارسی)', false),
  ('orders_en', 'بات اطلاعات مشتری (انگلیسی)', false)
on conflict (id) do nothing;

-- helpful lookup for the edge functions (no secrets exposed anywhere)
comment on table public.bot_config is
  'Telegram bot credentials (secret) readable only by admin / service_role';
