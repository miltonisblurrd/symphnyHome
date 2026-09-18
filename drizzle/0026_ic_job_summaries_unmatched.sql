-- Project summaries can land before a job is matched. They stay in this table,
-- never on Receiving.
alter table ic_job_summaries
  alter column job_id drop not null;
