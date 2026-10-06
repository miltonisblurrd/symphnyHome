-- Let a designer choose which jobs appear on Show.
-- Safe to run more than once. Also included in 0035 for a fresh database.

alter table ic_jobs
  add column if not exists show_on boolean not null default false;
