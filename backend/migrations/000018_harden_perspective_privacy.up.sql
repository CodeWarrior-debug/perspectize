-- Harden perspectives.privacy: no NULLs, defaulted, constrained to the two known values.
-- The Privacy enum (PUBLIC/PRIVATE) is stored lowercase; see backend/internal/adapters/repositories/postgres/helpers.go.
--
-- Numbering note: this was authored as 000017 but renumbered to 000018 because
-- open PR #346 (feat(messaging)) already holds 000017_add_messaging. DDL below is
-- idempotent so it is safe on a fresh DB or one where the change was applied
-- out of band.

UPDATE public.perspectives SET privacy = 'public' WHERE privacy IS NULL;

ALTER TABLE public.perspectives ALTER COLUMN privacy SET DEFAULT 'public';
ALTER TABLE public.perspectives ALTER COLUMN privacy SET NOT NULL;

ALTER TABLE public.perspectives DROP CONSTRAINT IF EXISTS perspectives_privacy_check;
ALTER TABLE public.perspectives
    ADD CONSTRAINT perspectives_privacy_check CHECK (privacy IN ('public', 'private'));
