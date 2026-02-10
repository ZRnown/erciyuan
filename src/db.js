import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function ensureDbDirectory(filePath) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
}

function hasColumn(db, tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function ensureColumn(db, tableName, columnName, columnSql) {
  if (hasColumn(db, tableName, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`);
}

function runMigrations(db) {
  ensureColumn(db, "protected_assets", "base_mode", "TEXT NOT NULL DEFAULT 'reaction'");
  ensureColumn(db, "protected_assets", "passcode_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "protected_assets", "quota_policy", "TEXT NOT NULL DEFAULT 'open_share'");
  ensureColumn(db, "protected_assets", "statement_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "protected_assets", "statement_text", "TEXT");

  ensureColumn(db, "unlock_progress", "statement_confirmed", "INTEGER NOT NULL DEFAULT 0");
}

export function createDatabase(dbPath) {
  ensureDbDirectory(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS protected_assets (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      gate_channel_id TEXT NOT NULL,
      gate_message_id TEXT UNIQUE,
      source_type TEXT NOT NULL,
      source_channel_id TEXT,
      source_message_id TEXT,
      source_url TEXT,
      unlock_mode TEXT NOT NULL,
      base_mode TEXT NOT NULL DEFAULT 'reaction',
      passcode_enabled INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT,
      quota_policy TEXT NOT NULL DEFAULT 'open_share',
      statement_enabled INTEGER NOT NULL DEFAULT 0,
      statement_text TEXT,
      attachments_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS unlock_progress (
      gate_message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reaction_met INTEGER NOT NULL DEFAULT 0,
      comment_met INTEGER NOT NULL DEFAULT 0,
      password_met INTEGER NOT NULL DEFAULT 0,
      statement_confirmed INTEGER NOT NULL DEFAULT 0,
      delivered_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (gate_message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS daily_usage (
      user_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      used_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, date_key)
    );

    CREATE TABLE IF NOT EXISTS asset_id_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_value INTEGER NOT NULL
    );

    INSERT OR IGNORE INTO asset_id_sequence (id, next_value)
    VALUES (1, 1);

    CREATE INDEX IF NOT EXISTS idx_protected_assets_gate_channel
      ON protected_assets(gate_channel_id);

    CREATE INDEX IF NOT EXISTS idx_progress_user
      ON unlock_progress(user_id);

    CREATE INDEX IF NOT EXISTS idx_daily_usage_date
      ON daily_usage(date_key);
  `);

  runMigrations(db);

  return db;
}
