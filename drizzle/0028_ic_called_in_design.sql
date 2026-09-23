-- Lead can be Google and called-in at the same time.
alter table ic_leads
  add column if not exists called_in boolean not null default false;

-- Designer grade of the install, and a simple-closet skip of job check.
alter table ic_jobs
  add column if not exists install_grade integer;

alter table ic_jobs
  add column if not exists install_grade_note text;

alter table ic_jobs
  add column if not exists install_graded_by uuid references ic_staff(id);

alter table ic_jobs
  add column if not exists install_graded_at timestamp with time zone;

alter table ic_jobs
  add column if not exists skip_job_check boolean not null default false;
