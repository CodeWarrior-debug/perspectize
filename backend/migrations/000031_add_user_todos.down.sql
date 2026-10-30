-- Reverses 000031_add_user_todos.up.sql. Dependent tables first (user_todos references the other two).
-- Dropping a table also drops its triggers and indexes.
DROP TABLE IF EXISTS public.user_todos, public.user_todo_lists, public.todo_actions;
