import pg from 'pg'

const { Pool } = pg
export const hasDatabase = Boolean(process.env.DATABASE_URL)
export const pool = hasDatabase ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
}) : null

export async function initDatabase() {
  if (!pool) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      planner_state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS planner_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      public_id TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      external_user_id TEXT,
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS planner_workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      planner_state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS planner_memberships (
      account_id UUID NOT NULL REFERENCES planner_accounts(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES planner_workspaces(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      project_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(account_id, workspace_id)
    );
    ALTER TABLE planner_memberships ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE planner_memberships ADD COLUMN IF NOT EXISTS project_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE TABLE IF NOT EXISTS planner_invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES planner_workspaces(id) ON DELETE CASCADE,
      code TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      project_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by UUID NOT NULL REFERENCES planner_accounts(id) ON DELETE CASCADE,
      used_by UUID REFERENCES planner_accounts(id) ON DELETE SET NULL,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS planner_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id UUID NOT NULL REFERENCES planner_accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      context TEXT NOT NULL DEFAULT 'company',
      title TEXT NOT NULL DEFAULT 'Новый диалог',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS planner_sessions_expiry_idx ON planner_sessions(expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS planner_accounts_external_user_unique ON planner_accounts(external_user_id) WHERE external_user_id IS NOT NULL AND external_user_id <> '';
    CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at);

    UPDATE planner_workspaces SET planner_state='{"focus":"","projects":[],"decisions":[]}'::jsonb,updated_at=NOW()
    WHERE jsonb_array_length(COALESCE(planner_state->'projects','[]'::jsonb))=8
      AND planner_state->'projects' @> '[{"id":"company"},{"id":"platform"},{"id":"ai"},{"id":"business"},{"id":"life"},{"id":"website"},{"id":"brand"},{"id":"marketing"}]'::jsonb;
  `)
}
