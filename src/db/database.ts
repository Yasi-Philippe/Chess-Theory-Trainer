import * as SQLite from 'expo-sqlite';

export type Db = SQLite.SQLiteDatabase;

let _db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('chess.db');
    await runMigrations(_db);
  }
  return _db;
}

/** Resets the singleton — used in tests only. */
export function _resetDbForTests() {
  _db = null;
}

async function runMigrations(db: Db): Promise<void> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0)',
  );

  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version LIMIT 1',
  );
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS openings (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        eco_code    TEXT NOT NULL,
        color       TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT 'main_line',
        description TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS opening_nodes (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        opening_id     TEXT    NOT NULL REFERENCES openings(id),
        parent_id      INTEGER REFERENCES opening_nodes(id),
        move_san       TEXT,
        ply            INTEGER NOT NULL DEFAULT 0,
        is_player_move INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_opening_id ON opening_nodes(opening_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_parent_id  ON opening_nodes(parent_id);

      CREATE TABLE IF NOT EXISTS opening_stats (
        opening_id   TEXT    PRIMARY KEY REFERENCES openings(id),
        best_score   INTEGER NOT NULL DEFAULT 0,
        total_games  INTEGER NOT NULL DEFAULT 0
      );
    `);

    if (row) {
      await db.runAsync('UPDATE schema_version SET version = 1');
    } else {
      await db.runAsync('INSERT INTO schema_version (version) VALUES (1)');
    }
  }
}
