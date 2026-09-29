DROP INDEX IF EXISTS idx_users_clerk_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS clerk_user_id;
