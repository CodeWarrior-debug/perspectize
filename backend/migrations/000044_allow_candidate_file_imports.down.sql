-- Restores the original constraints. This FAILS if any candidate_file source or
-- web_page source/item rows exist: remove those rows first. No data is deleted here.
ALTER TABLE public.import_job_sources DROP CONSTRAINT IF EXISTS import_job_sources_type_check;
ALTER TABLE public.import_job_sources ADD CONSTRAINT import_job_sources_type_check CHECK (source_type IN ('youtube_channel', 'tmdb_person'));

ALTER TABLE public.import_job_sources DROP CONSTRAINT IF EXISTS import_job_sources_destination_check;
ALTER TABLE public.import_job_sources ADD CONSTRAINT import_job_sources_destination_check CHECK (destination_type IN ('youtube_video', 'movie'));

ALTER TABLE public.import_job_items DROP CONSTRAINT IF EXISTS import_job_items_destination_check;
ALTER TABLE public.import_job_items ADD CONSTRAINT import_job_items_destination_check CHECK (destination_type IN ('youtube_video', 'movie'));
