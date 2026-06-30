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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(account_id, workspace_id)
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
  `)
}
