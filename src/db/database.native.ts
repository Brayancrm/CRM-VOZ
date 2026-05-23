import * as SQLite from 'expo-sqlite';

const DB_NAME = 'crmvoz.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone_normalized TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS call_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  contact_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  audio_uri TEXT,
  transcription_status TEXT NOT NULL DEFAULT 'pending',
  transcription_text TEXT,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL,
  contact_id TEXT NOT NULL,
  call_session_id TEXT,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (call_session_id) REFERENCES call_sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS scheduled_calls (
  id TEXT PRIMARY KEY NOT NULL,
  contact_id TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0,
  notified_1h INTEGER NOT NULL DEFAULT 0,
  notified_5m INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_at ON scheduled_calls(scheduled_at);
`;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(scheduled_calls)`
  );
  if (!cols.some((c) => c.name === 'note')) {
    await db.execAsync(
      `ALTER TABLE scheduled_calls ADD COLUMN note TEXT NOT NULL DEFAULT ''`
    );
  }
  if (!cols.some((c) => c.name === 'completed')) {
    await db.execAsync(
      `ALTER TABLE scheduled_calls ADD COLUMN completed INTEGER NOT NULL DEFAULT 0`
    );
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  await dbInstance.execAsync(SCHEMA);
  await migrate(dbInstance);
  return dbInstance;
}

export async function resetDatabaseForDev(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }
  await SQLite.deleteDatabaseAsync(DB_NAME);
  await getDatabase();
}
