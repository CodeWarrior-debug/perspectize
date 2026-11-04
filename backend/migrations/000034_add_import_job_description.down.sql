-- Reverses 000034_add_import_job_description.up.sql.
ALTER TABLE import_jobs DROP COLUMN IF EXISTS description;
