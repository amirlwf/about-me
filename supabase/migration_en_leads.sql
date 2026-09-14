-- ============================================================
-- Migration: EN free-edit leads (run ONCE in Dashboard > SQL Editor,
-- AFTER schema.sql, BEFORE deploying the updated create-order fn)
-- Adds: email / source / raw_link columns, nullable phone, EN-aware
-- anon INSERT policy. Existing FA rows default to source='fa_site'.
-- Idempotent-safe: re-running is harmless.
-- ============================================================

alter table public.orders add column if not exists email text;
alter table public.orders add column if not exists source text not null default 'fa_site';
alter table public.orders add column if not exists raw_link text;
alter table public.orders alter column phone drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_email_check') then
    alter table public.orders add constraint orders_email_check
      check (email is null or email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_source_check') then
    alter table public.orders add constraint orders_source_check
      check (source in ('fa_site', 'en_landing'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_raw_link_check') then
    alter table public.orders add constraint orders_raw_link_check
      check (raw_link is null or char_length(raw_link) <= 500);
  end if;
end $$;

-- EN-aware anon INSERT: FA branch unchanged, EN branch allows
-- source='en_landing' + valid email + NULL phone (service fixed to edit)
drop policy if exists orders_anon_insert on public.orders;
create policy orders_anon_insert on public.orders
  for insert to anon
  with check (
    char_length(name) between 2 and 80
    and char_length(description) between 5 and 2000
    and service in ('edit', 'web', 'pc')
    and (
      (source = 'fa_site' and phone ~ '^09[0-9]{9}$')
      or (source = 'en_landing' and service = 'edit' and phone is null
          and email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
    )
  );
