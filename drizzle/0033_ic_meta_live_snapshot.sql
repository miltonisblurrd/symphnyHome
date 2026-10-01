-- Latest Meta Ads snapshot for the Inspired Closets OS ads tab.
-- The hourly Vercel cron replaces this row. It does not store tokens.
-- Safe to re-run. Apply in the Supabase SQL editor.

create table if not exists ic_meta_live_snapshot (
  id text primary key,
  payload jsonb not null,
  synced_at timestamp with time zone not null,
  updated_at timestamp with time zone default now() not null
);

alter table ic_meta_live_snapshot enable row level security;
