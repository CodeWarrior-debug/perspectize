-- Harden perspectives.privacy: no NULLs, defaulted, constrained to the two known values.
-- The Privacy enum (PUBLIC/PRIVATE) is stored lowercase; see backend/internal/adapters/repositories/postgres/helpers.go.

UPDATE public.perspectives SET privacy = 'public' WHERE privacy IS NULL;

ALTER TABLE public.perspectives ALTER COLUMN privacy SET DEFAULT 'public';
ALTER TABLE public.perspectives ALTER COLUMN privacy SET NOT NULL;

ALTER TABLE public.perspectives
    ADD CONSTRAINT perspectives_privacy_check CHECK (privacy IN ('public', 'private'));
