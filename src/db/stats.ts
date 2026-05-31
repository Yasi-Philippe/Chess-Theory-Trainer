import { getDb } from './database';

export interface OpeningStats {
  opening_id: string;
  best_score: number;
  total_games: number;
}

export async function getStats(openingId: string): Promise<OpeningStats | null> {
  const db = await getDb();
  return db.getFirstAsync<OpeningStats>(
    'SELECT * FROM opening_stats WHERE opening_id = ?',
    [openingId],
  );
}

export async function getAllStats(): Promise<OpeningStats[]> {
  const db = await getDb();
  return db.getAllAsync<OpeningStats>('SELECT * FROM opening_stats');
}

export async function recordGame(openingId: string, score: number): Promise<OpeningStats> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO opening_stats (opening_id, best_score, total_games)
     VALUES (?, ?, 1)
     ON CONFLICT(opening_id) DO UPDATE SET
       total_games = total_games + 1,
       best_score  = MAX(best_score, excluded.best_score)`,
    [openingId, score],
  );
  const updated = await getStats(openingId);
  return updated!;
}
