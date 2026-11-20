-- Reverses 000037_add_import_job_description.up.sql.
ALTER TABLE import_jobs DROP COLUMN IF EXISTS description;
