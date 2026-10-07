-- Partial GIN indexes serving the personId filter (response->'cast' @> '[{"id":N}]')
-- on movie rows only. jsonb_path_ops is smaller/faster for containment (@>) lookups.
CREATE INDEX IF NOT EXISTS idx_content_movie_cast
    ON content USING GIN ((response->'cast') jsonb_path_ops)
    WHERE content_type = 'movie';

CREATE INDEX IF NOT EXISTS idx_content_movie_directors
    ON content USING GIN ((response->'directors') jsonb_path_ops)
    WHERE content_type = 'movie';
