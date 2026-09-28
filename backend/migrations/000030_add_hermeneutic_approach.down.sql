ALTER TABLE perspectives DROP COLUMN IF EXISTS hermeneutic_approach_id;
ALTER TABLE perspectives DROP COLUMN IF EXISTS hermeneutic_custom_text;

DROP TABLE IF EXISTS hermeneutic_approach;
