-- ============================================================
-- Migration: portfolio showcase (run ONCE in Dashboard > SQL Editor)
-- Table portfolio_items + public 'portfolio' storage bucket + RLS.
-- Admin (service_role / role=admin) manages; public reads visible only.
-- Idempotent-safe: re-running is harmless.
-- ============================================================

create table if not exists public.portfolio_items (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  page       text not null default 'en' check (page in ('en', 'fa')),
  title      text not null check (char_length(title) between 2 and 120),
  caption    text check (caption is null or char_length(caption) <= 500),
  thumb_url  text,
  video_url  text,
  sort       int not null default 0,
  visible    boolean not null default true
);
create index if not exists portfolio_page_idx on public.portfolio_items (page, sort, id);

alter table public.portfolio_items enable row level security;

drop policy if exists portfolio_public_read on public.portfolio_items;
create policy portfolio_public_read on public.portfolio_items
  for select to anon using (visible = true);

drop policy if exists portfolio_admin_all on public.portfolio_items;
create policy portfolio_admin_all on public.portfolio_items
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- public bucket (create if missing) + open read, admin write
insert into storage.buckets (id, name, public)
values ('portfolio', 'portfolio', true)
on conflict (id) do update set public = true;

drop policy if exists portfolio_bucket_read on storage.objects;
create policy portfolio_bucket_read on storage.objects
  for select to anon using (bucket_id = 'portfolio');

drop policy if exists portfolio_bucket_write on storage.objects;
create policy portfolio_bucket_write on storage.objects
  for all to authenticated
  using (bucket_id = 'portfolio' and public.is_admin())
  with check (bucket_id = 'portfolio' and public.is_admin());

-- realtime: new portfolio rows appear in admin instantly
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.portfolio_items;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
