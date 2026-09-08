-- Retention is no longer enforced in-trigger. The application-side
-- RetentionSweeper (gated by MESSAGE_RETENTION_MAX) is now the only pruner,
-- and it is disabled by default -> unbounded history.
CREATE OR REPLACE FUNCTION publish_and_prune_message() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('thread_events', json_build_object(
        'type',       'MESSAGE_POSTED',
        'thread_id',  NEW.thread_id,
        'seq',        NEW.seq,
        'message_id', NEW.id
    )::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
