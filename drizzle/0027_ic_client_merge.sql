-- One client, many jobs: soft-merge duplicate workbook clients.
-- Descriptors (PRIMARY ADD ON, A/O) belong on ic_jobs.title, not the client name.

alter table ic_clients
  add column if not exists identity_key text;

alter table ic_clients
  add column if not exists merged_into_client_id uuid references ic_clients(id);

create index if not exists ic_clients_identity_key_idx
  on ic_clients (identity_key)
  where deleted_at is null and merged_into_client_id is null;

create index if not exists ic_clients_merged_into_idx
  on ic_clients (merged_into_client_id)
  where merged_into_client_id is not null;

alter table ic_jobs
  add column if not exists title text;

alter table ic_jobs
  add column if not exists duplicate_of_job_id uuid references ic_jobs(id);

create index if not exists ic_jobs_duplicate_of_idx
  on ic_jobs (duplicate_of_job_id)
  where duplicate_of_job_id is not null;

create index if not exists ic_jobs_client_id_open_idx
  on ic_jobs (client_id)
  where deleted_at is null and duplicate_of_job_id is null;

-- Ambiguous clusters the auto-merge skip; team confirms in the OS.
create table if not exists ic_client_merge_candidates (
  id uuid primary key default gen_random_uuid() not null,
  identity_key text not null,
  client_ids uuid[] not null,
  reason text not null,
  status text not null default 'pending',
  resolution text,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists ic_client_merge_candidates_status_idx
  on ic_client_merge_candidates (status)
  where status = 'pending';
