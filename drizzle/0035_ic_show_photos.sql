-- Designer show-mode photos. Separate from installer job photos and proposals.
-- Safe to run more than once.

alter table ic_jobs
  add column if not exists show_label text;

alter table ic_jobs
  add column if not exists show_on boolean not null default false;

create table if not exists ic_show_photos (
  id uuid primary key default gen_random_uuid() not null,
  job_id uuid not null references ic_jobs(id) on delete cascade,
  designer_id uuid not null references ic_staff(id),
  storage_path text not null,
  caption text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  mime_type text,
  bytes integer,
  created_at timestamp with time zone default now() not null
);

create index if not exists ic_show_photos_designer_job_idx
  on ic_show_photos (designer_id, job_id, sort_order);

create unique index if not exists ic_show_photos_one_cover
  on ic_show_photos (job_id, designer_id)
  where is_cover;
