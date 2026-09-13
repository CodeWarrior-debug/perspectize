-- Restore the in-trigger prune (newest ~1000 per thread).
CREATE OR REPLACE FUNCTION publish_and_prune_message() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('thread_events', json_build_object(
        'type',       'MESSAGE_POSTED',
        'thread_id',  NEW.thread_id,
        'seq',        NEW.seq,
        'message_id', NEW.id
    )::text);

    IF NEW.seq % 50 = 0 THEN
        DELETE FROM messages
         WHERE thread_id = NEW.thread_id
           AND seq <= NEW.seq - 1000;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
