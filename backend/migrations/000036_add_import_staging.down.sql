-- Reverses 000036_add_import_staging.up.sql. Children first; dropping a table also drops its triggers and indexes.
DROP TABLE IF EXISTS public.import_job_items, public.import_job_sources, public.import_jobs;
