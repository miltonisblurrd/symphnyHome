-- Studio install reports Frank uploads in Receiving.
-- The PDF stays on the job file. Line-level stock checks are a later pass.
-- Safe to re-run.

create table if not exists ic_install_reports (
  id uuid primary key default gen_random_uuid() not null,
  job_id uuid references ic_jobs(id) on delete set null,
  order_name text,
  so_number text,
  ship_date date,
  item_count integer not null default 0,
  source_filename text,
  storage_path text,
  public_url text,
  status text not null default 'unmatched',
  parse_quality jsonb,
  created_by uuid references ic_staff(id),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists ic_install_reports_job_idx
  on ic_install_reports (job_id, created_at desc);

create index if not exists ic_install_reports_created_idx
  on ic_install_reports (created_at desc);
