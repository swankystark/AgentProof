-- Fix: DB default for current_step was 'connect_system' but code creates sessions with 'create_order'.
-- Sessions created via the API always pass an explicit value, so this only affects raw SQL inserts,
-- but align the default to prevent silent divergence.
ALTER TABLE "testing_sessions" ALTER COLUMN "current_step" SET DEFAULT 'create_order';
