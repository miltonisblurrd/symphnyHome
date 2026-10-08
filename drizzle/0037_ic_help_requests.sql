-- Help / fix requests submitted from the Help button in every portal.
-- Safe to run more than once.

create table if not exists ic_help_requests (
  id uuid primary key default gen_random_uuid() not null,
  staff_id uuid references ic_staff(id) on delete set null,
  submitter_name text,
  submitter_role text,
  portal text,
  page_url text,
  user_agent text,
  subject text not null,
  message text,
  priority text not null default 'medium',
  status text not null default 'new',
  attachments jsonb not null default '[]'::jsonb,
  emailed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create index if not exists ic_help_requests_created_idx
  on ic_help_requests (created_at desc);

insert into storage.buckets (id, name, public)
values ('ic-help-uploads', 'ic-help-uploads', false)
on conflict (id) do nothing;
