-- ============================================================
-- migration_pages.sql — WordPress-like content model for amirlwf.ir
-- Run ONCE in Dashboard > SQL Editor (idempotent: safe to re-run).
--
--   pages   : block-based pages (draft / published / scheduled)
--   menus   : navigation per location (header/footer × fa/en)
--   media   : uploaded files, backed by the public `media` bucket
--
-- Public (anon) can SELECT menus + media, and pages only when they are
-- actually live; every write path is admin-only.
-- ============================================================

-- ---------------------------------------------------------------- pages
create table if not exists public.pages (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  slug             text not null unique,
  lang             text not null default 'fa' check (lang in ('fa', 'en')),
  status           text not null default 'draft'
                   check (status in ('draft', 'published', 'scheduled')),
  publish_at       timestamptz,
  blocks           jsonb not null default '[]'::jsonb,
  seo_title        text,
  seo_description  text,
  og_image         text,
  show_in_sitemap  boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       text
);

create index if not exists pages_status_idx on public.pages (status, publish_at);
create index if not exists pages_lang_idx on public.pages (lang);

alter table public.pages enable row level security;

-- live = published (optionally timed) OR scheduled whose time has come
drop policy if exists pages_public_live on public.pages;
create policy pages_public_live on public.pages
  for select to anon
  using (
    (status = 'published' and (publish_at is null or publish_at <= now()))
    or (status = 'scheduled' and publish_at is not null and publish_at <= now())
  );

drop policy if exists pages_admin_all on public.pages;
create policy pages_admin_all on public.pages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------- menus
create table if not exists public.menus (
  location   text primary key
             check (location in ('fa_header', 'fa_footer', 'en_header', 'en_footer')),
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.menus enable row level security;

drop policy if exists menus_public_read on public.menus;
create policy menus_public_read on public.menus
  for select to anon using (true);

drop policy if exists menus_admin_all on public.menus;
create policy menus_admin_all on public.menus
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------- media
create table if not exists public.media (
  id         uuid primary key default gen_random_uuid(),
  path       text not null unique,
  url        text not null,
  alt        text not null default '',
  caption    text not null default '',
  mime       text,
  width      integer,
  height     integer,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  created_by text
);

alter table public.media enable row level security;

drop policy if exists media_public_read on public.media;
create policy media_public_read on public.media
  for select to anon using (true);

drop policy if exists media_admin_all on public.media;
create policy media_admin_all on public.media
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- public storage bucket for uploads (same shape as the portfolio bucket)
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists media_bucket_read on storage.objects;
create policy media_bucket_read on storage.objects
  for select to anon using (bucket_id = 'media');

drop policy if exists media_bucket_write on storage.objects;
create policy media_bucket_write on storage.objects
  for all to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

-- ---------------------------------------------------------------- helper
-- Is a page publicly visible right now? Used by the prerender tool and by
-- the panel ("publish now" flips status + publish_at together).
create or replace function public.page_is_live(p public.pages)
returns boolean
language sql
immutable
as $$
  select (p.status = 'published' and (p.publish_at is null or p.publish_at <= now()))
      or (p.status = 'scheduled' and p.publish_at is not null and p.publish_at <= now())
$$;

-- ---------------------------------------------------------------- verify
do $$
declare
  t text;
begin
  foreach t in array array['pages', 'menus', 'media'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'migration_pages.sql incomplete: public.% missing', t;
    end if;
  end loop;
  raise notice 'migration_pages.sql OK: pages, menus, media + storage bucket media';
end $$;
