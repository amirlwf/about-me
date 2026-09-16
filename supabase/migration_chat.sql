-- ============================================================
-- migration_chat.sql — LIVE-CHAT BACKEND (chat_messages table)
-- Root cause of "live chat not working": the chat section existed in
-- schema.sql but was NEVER applied to the live DB (404 PGRST205).
-- Run in Supabase SQL Editor. Idempotent — safe to run again.
-- ============================================================

create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visitor_id text not null check (visitor_id ~ '^[0-9a-f]{8,32}$'),
  sender     text not null check (sender in ('visitor', 'owner')),
  text       text not null check (char_length(text) between 1 and 2000),
  source_ip  text
);
create index if not exists chat_visitor_idx on public.chat_messages (visitor_id, id);

alter table public.chat_messages enable row level security;

-- anon: INSERT visitor messages only (edge fn validates + notifies)
drop policy if exists chat_anon_insert on public.chat_messages;
create policy chat_anon_insert on public.chat_messages
  for insert to anon
  with check (
    sender = 'visitor'
    and visitor_id ~ '^[0-9a-f]{8,32}$'
    and char_length(text) between 1 and 2000
  );

-- anon: read ONLY own thread, scoped by visitor id
-- (client sends header "x-visitor-id: <id>")
drop policy if exists chat_track_own on public.chat_messages;
create policy chat_track_own on public.chat_messages
  for select to anon
  using (
    visitor_id =
    nullif((current_setting('request.headers', true)::json ->> 'x-visitor-id'), '')
  );

-- admin (authenticated + role=admin): full access
drop policy if exists chat_admin_all on public.chat_messages;
create policy chat_admin_all on public.chat_messages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Realtime: broadcast INSERTs to subscribed visitors
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.chat_messages;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
