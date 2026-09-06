-- ============================================================
-- amirlwf.ir — Supabase schema (run in Dashboard > SQL Editor)
-- Tables: orders, site_content, notifications (+ RLS + Realtime)
-- ============================================================

-- ---------- orders ----------
create table if not exists public.orders (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 2 and 80),
  phone       text not null check (phone ~ '^09[0-9]{9}$'),
  service     text not null check (service in ('edit', 'web', 'pc')),
  sub_service text,
  description text not null check (char_length(description) between 5 and 2000),
  status      text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  track_token uuid not null,
  source_ip   text,
  admin_reply text
);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx  on public.orders (status);
create index if not exists orders_ip_idx      on public.orders (source_ip, created_at desc);

-- ---------- site_content (admin-editable key/value JSON) ----------
create table if not exists public.site_content (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- notifications (one row per dispatched notification) ----------
create table if not exists public.notifications (
  id       bigint generated always as identity primary key,
  order_id bigint references public.orders (id) on delete cascade,
  channel  text not null,               -- site | telegram | whatsapp | rubika
  payload  jsonb,
  sent_at  timestamptz not null default now()
);
create index if not exists notifications_order_idx on public.notifications (order_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.orders        enable row level security;
alter table public.site_content  enable row level security;
alter table public.notifications enable row level security;

-- helper: is the caller an admin? (role flag in auth user_metadata)
create or replace function public.is_admin()
returns boolean language sql stable as
$$ select coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'admin' $$;

-- --- orders ---
-- anon: INSERT only, with server-side CHECKs (phone format enforced by DB too)
drop policy if exists orders_anon_insert on public.orders;
create policy orders_anon_insert on public.orders
  for insert to anon
  with check (
    phone ~ '^09[0-9]{9}$'
    and service in ('edit', 'web', 'pc')
    and char_length(name) between 2 and 80
    and char_length(description) between 5 and 2000
  );

-- anon: read ONLY their own order, scoped by the unguessable track token
-- (client sends header "x-track-token: <uuid>")
drop policy if exists orders_track_own on public.orders;
create policy orders_track_own on public.orders
  for select to anon
  using (
    track_token::text =
    nullif((current_setting('request.headers', true)::json ->> 'x-track-token'), '')
  );

-- admin (authenticated + role=admin): full access
drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- --- site_content ---
-- anon: read only (pages fetch dynamic overrides; anon can NEVER write)
drop policy if exists site_content_anon_read on public.site_content;
create policy site_content_anon_read on public.site_content
  for select to anon using (true);

-- admin: full access
drop policy if exists site_content_admin_all on public.site_content;
create policy site_content_admin_all on public.site_content
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- --- notifications ---
-- admin: full access (edge functions use service_role and bypass RLS)
drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all on public.notifications
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Realtime: instant order delivery to admin panel + live tracking
-- (On Supabase Cloud these tables are usually already in the
-- publication; the statements below are idempotent-safe.)
-- ============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.orders;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch
  before update on public.site_content
  for each row execute function public.touch_updated_at();
