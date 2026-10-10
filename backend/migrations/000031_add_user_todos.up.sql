-- User todos ("Plan"): todo_actions (lookup: 10 presets plus user-entered actions),
-- user_todo_lists (named, ordered groups), user_todos (the plan itself).
-- Spec: docs/superpowers/specs/2026-10-08-user-todos-design.md (Data model, Foreign keys).
--
-- Numbering note: the spec and plan say 000030, but main already has
-- 000030_add_content_length_display (#567). This migration is 000031.
--
-- Every FK is ON DELETE RESTRICT: nothing cascades and nothing is nulled. The
-- service clears or reassigns references before it deletes a parent.
--
-- Idempotent: safe on a fresh DB or one already patched out of band.

-- Lookup of actions. user_id NULL = preset (global); set = user-entered action.
CREATE TABLE IF NOT EXISTS public.todo_actions (
    id serial NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    description text NOT NULL DEFAULT '',
    typical_sequence integer NULL,
    user_id integer NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT todo_actions_pk PRIMARY KEY (id),
    CONSTRAINT todo_actions_user_key_unique UNIQUE NULLS NOT DISTINCT (user_id, key),
    CONSTRAINT todo_actions_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);

-- Seed the presets in typical sequence. Idempotent via the NULLS NOT DISTINCT unique key.
INSERT INTO public.todo_actions (key, label, description, typical_sequence, user_id)
VALUES
    ('acquire',  'Acquire',  'Buy, borrow or download it',                          1,  NULL),
    ('consume',  'Consume',  'Watch, read or listen for the first time',            2,  NULL),
    ('process',  'Process',  'Digest it: take notes, summarize, extract',           3,  NULL),
    ('research', 'Research', 'Look into background, sources and related work',      4,  NULL),
    ('verify',   'Verify',   'Fact-check the claims in it',                         5,  NULL),
    ('compare',  'Compare',  'Set it against other content',                        6,  NULL),
    ('review',   'Review',   'Write or refine your perspective on it',              7,  NULL),
    ('discuss',  'Discuss',  'Talk it over with someone or in a thread',            8,  NULL),
    ('share',    'Share',    'Send or recommend it to someone',                     9,  NULL),
    ('revisit',  'Revisit',  'Consume it again',                                    10, NULL)
ON CONFLICT (user_id, key) DO NOTHING;

-- Named lists. Privacy is independent of the privacy of the todos in the list.
CREATE TABLE IF NOT EXISTS public.user_todo_lists (
    id serial NOT NULL,
    user_id integer NOT NULL,
    name varchar(100) NOT NULL,
    description text NULL,
    privacy text NOT NULL DEFAULT 'public',
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT user_todo_lists_pk PRIMARY KEY (id),
    CONSTRAINT user_todo_lists_user_name_unique UNIQUE (user_id, name),
    CONSTRAINT user_todo_lists_privacy_check CHECK (privacy IN ('public', 'private')),
    CONSTRAINT user_todo_lists_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);

-- The plan. Owner column is user_id (like every other table); assignees will get their own table later.
CREATE TABLE IF NOT EXISTS public.user_todos (
    id serial NOT NULL,
    user_id integer NOT NULL,
    content_id integer NULL,
    name varchar(255) NULL,
    action_id integer NOT NULL,
    priority valid_integer_range NULL,
    status text NOT NULL DEFAULT 'not_started',
    percent_complete smallint NOT NULL DEFAULT 0,
    start_date date NULL,
    end_date date NULL,
    due_date date NULL,
    comments text NULL,
    privacy text NOT NULL DEFAULT 'public',
    list_id integer NULL,
    list_position integer NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT user_todos_pk PRIMARY KEY (id),
    CONSTRAINT user_todos_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
    CONSTRAINT user_todos_content_fk FOREIGN KEY (content_id) REFERENCES public.content(id) ON DELETE RESTRICT,
    CONSTRAINT user_todos_action_fk FOREIGN KEY (action_id) REFERENCES public.todo_actions(id) ON DELETE RESTRICT,
    CONSTRAINT user_todos_list_fk FOREIGN KEY (list_id) REFERENCES public.user_todo_lists(id) ON DELETE RESTRICT,
    CONSTRAINT user_todos_status_check CHECK (status IN ('not_started', 'in_progress', 'done', 'dropped')),
    CONSTRAINT user_todos_percent_check CHECK (percent_complete BETWEEN 0 AND 100),
    CONSTRAINT user_todos_privacy_check CHECK (privacy IN ('public', 'private')),
    CONSTRAINT user_todos_content_or_name_check CHECK (content_id IS NOT NULL OR name IS NOT NULL),
    CONSTRAINT user_todos_list_position_check CHECK ((list_id IS NULL) = (list_position IS NULL))
);

-- Indexes. (user_id, status) serves the owner's Plan page; (list_id, list_position) serves list order.
-- content_id and action_id are indexed because every FK is indexed (and RESTRICT checks scan them).
CREATE INDEX IF NOT EXISTS user_todos_user_status_idx ON public.user_todos (user_id, status);
CREATE INDEX IF NOT EXISTS user_todos_list_position_idx ON public.user_todos (list_id, list_position);
CREATE INDEX IF NOT EXISTS user_todos_content_id_idx ON public.user_todos (content_id);
CREATE INDEX IF NOT EXISTS user_todos_action_id_idx ON public.user_todos (action_id);

-- One open todo per owner, content and action. A finished one (done/dropped) does not block a later revisit.
CREATE UNIQUE INDEX IF NOT EXISTS user_todos_open_content_action_unique
    ON public.user_todos (user_id, content_id, action_id)
    WHERE content_id IS NOT NULL AND status IN ('not_started', 'in_progress');

-- updated_at triggers (CREATE TRIGGER has no IF NOT EXISTS, so drop first).
DROP TRIGGER IF EXISTS set_updated_at ON public.todo_actions;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.todo_actions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.user_todo_lists;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.user_todo_lists
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.user_todos;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.user_todos
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();
