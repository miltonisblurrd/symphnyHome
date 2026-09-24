-- Designer notes on the job, and the confirmation she sent Frank that the design is done.
alter table ic_jobs
  add column if not exists designer_notes text;

alter table ic_jobs
  add column if not exists design_ready_at timestamp with time zone;

alter table ic_jobs
  add column if not exists design_ready_choice text;
