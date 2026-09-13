-- Messaging: threads, participants, messages, per-thread sequence, triggers.

CREATE TABLE message_threads (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT,
    created_by      BIGINT NOT NULL REFERENCES users(id),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE thread_participants (
    thread_id     BIGINT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
    user_id       BIGINT NOT NULL REFERENCES users(id),
    role          TEXT   NOT NULL DEFAULT 'MEMBER',
    last_read_seq BIGINT NOT NULL DEFAULT 0,
    muted         BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at       TIMESTAMPTZ,
    PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX idx_thread_participants_active_user
    ON thread_participants (user_id) WHERE left_at IS NULL;

CREATE TABLE thread_sequences (
    thread_id BIGINT PRIMARY KEY REFERENCES message_threads(id) ON DELETE CASCADE,
    next_seq  BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE messages (
    id           BIGSERIAL PRIMARY KEY,
    thread_id    BIGINT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
    sender_id    BIGINT NOT NULL REFERENCES users(id),
    seq          BIGINT NOT NULL,
    body         TEXT   NOT NULL,
    client_nonce TEXT   NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at    TIMESTAMPTZ,
    deleted_at   TIMESTAMPTZ,
    UNIQUE (thread_id, seq),
    UNIQUE (thread_id, sender_id, client_nonce)
);

CREATE INDEX idx_messages_thread_seq_desc ON messages (thread_id, seq DESC);

-- Create the per-thread sequence row when a thread is created.
CREATE FUNCTION init_thread_sequence() RETURNS trigger AS $$
BEGIN
    INSERT INTO thread_sequences (thread_id, next_seq) VALUES (NEW.id, 1);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_init_thread_sequence
    AFTER INSERT ON message_threads
    FOR EACH ROW EXECUTE FUNCTION init_thread_sequence();

-- Allocate the next per-thread seq atomically before insert.
CREATE FUNCTION assign_message_seq() RETURNS trigger AS $$
BEGIN
    UPDATE thread_sequences
       SET next_seq = next_seq + 1
     WHERE thread_id = NEW.thread_id
    RETURNING next_seq - 1 INTO NEW.seq;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no thread_sequences row for thread %', NEW.thread_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_message_seq
    BEFORE INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION assign_message_seq();

-- After insert: publish a compact NOTIFY envelope and prune old rows.
CREATE FUNCTION publish_and_prune_message() RETURNS trigger AS $$
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

CREATE TRIGGER trg_publish_and_prune_message
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION publish_and_prune_message();

-- Keep message_threads.last_message_at fresh for inbox sorting.
CREATE FUNCTION touch_thread_last_message() RETURNS trigger AS $$
BEGIN
    UPDATE message_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_thread_last_message
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION touch_thread_last_message();
