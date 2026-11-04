-- Reverses 000033_add_content_import_job_id.up.sql. Dropping the column also drops its foreign key.
ALTER TABLE content DROP COLUMN IF EXISTS import_job_id;
