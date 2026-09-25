-- Studio / Stow project summaries Frank uploads to a job, and their parsed lines.
-- Lines are matched against ic_parts to show in stock / reserve / to order.
-- 0026 later lets job_id be null for summaries waiting on "Choose job".
-- Safe to re-run.

create table if not exists ic_job_summaries (
  id uuid primary key default gen_random_uuid() not null,
  job_id uuid not null references ic_jobs(id) on delete cascade,
  order_name text,
  order_id text,
  so_number text,
  purchased_on date,
  ship_date date,
  item_count integer not null default 0,
  total_cents integer not null default 0,
  source_filename text,
  storage_path text,
  public_url text,
  status text not null default 'review',
  parse_error text,
  parse_quality jsonb,
  confirmed_at timestamp with time zone,
  created_by uuid references ic_staff(id),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists ic_job_summaries_job_idx
  on ic_job_summaries (job_id, created_at desc);

create table if not exists ic_job_summary_lines (
  id uuid primary key default gen_random_uuid() not null,
  summary_id uuid not null references ic_job_summaries(id) on delete cascade,
  line_no integer,
  item_code text,
  description text,
  product_type text,
  dimensions text,
  finish text,
  qty integer not null default 1,
  total_cents integer not null default 0,
  classification text not null default 'unmatched',
  part_id uuid references ic_parts(id),
  available_qty integer not null default 0,
  reserve_qty integer not null default 0,
  order_qty integer not null default 0,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists ic_job_summary_lines_summary_idx
  on ic_job_summary_lines (summary_id, line_no);
