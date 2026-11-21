-- Staging accepts candidate files (source) and webpages (destination).
ALTER TABLE public.import_job_sources DROP CONSTRAINT IF EXISTS import_job_sources_type_check;
ALTER TABLE public.import_job_sources ADD CONSTRAINT import_job_sources_type_check CHECK (source_type IN ('youtube_channel', 'tmdb_person', 'candidate_file'));

ALTER TABLE public.import_job_sources DROP CONSTRAINT IF EXISTS import_job_sources_destination_check;
ALTER TABLE public.import_job_sources ADD CONSTRAINT import_job_sources_destination_check CHECK (destination_type IN ('youtube_video', 'movie', 'web_page'));

ALTER TABLE public.import_job_items DROP CONSTRAINT IF EXISTS import_job_items_destination_check;
ALTER TABLE public.import_job_items ADD CONSTRAINT import_job_items_destination_check CHECK (destination_type IN ('youtube_video', 'movie', 'web_page'));
