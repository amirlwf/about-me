-- migration_en_web_leads.sql — EN leads may now be video-editing (free edit)
-- OR web-design inquiries, so /en/services/web.html can submit service='web'.
-- Idempotent: recreates the anon INSERT policy only.
-- Run in the Supabase SQL Editor BEFORE deploying the updated create-order
-- function (schema.sql already contains this version for fresh installs).

drop policy if exists orders_anon_insert on public.orders;
create policy orders_anon_insert on public.orders
  for insert to anon
  with check (
    char_length(name) between 2 and 80
    and char_length(description) between 5 and 2000
    and service in ('edit', 'web', 'pc')
    and (
      (source = 'fa_site' and phone ~ '^09[0-9]{9}$')
      or (source = 'en_landing' and service in ('edit', 'web') and phone is null
          and email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
    )
  );
