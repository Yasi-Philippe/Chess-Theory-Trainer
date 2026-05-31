import { getDb } from './database';
import { OPENINGS } from '../data/openings';

// Module-level lock: concurrent calls (e.g. React StrictMode double-invoke)
// share a single in-flight promise instead of racing to insert duplicate rows.
let _seedPromise: Promise<void> | null = null;

export function seedOpenings(): Promise<void> {
  if (!_seedPromise) _seedPromise = _doSeed();
  return _seedPromise;
}

async function _doSeed(): Promise<void> {
  const db = await getDb();

  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM openings',
  );
  if ((row?.count ?? 0) > 0) return;

  await db.withTransactionAsync(async () => {
    for (const opening of OPENINGS) {
      await db.runAsync(
        'INSERT INTO openings (id, name, eco_code, color, category, description) VALUES (?, ?, ?, ?, ?, ?)',
        [opening.id, opening.name, opening.eco, opening.color, opening.category, opening.description],
      );

      // Root node (ply 0, no move)
      const rootResult = await db.runAsync(
        'INSERT INTO opening_nodes (opening_id, parent_id, move_san, ply, is_player_move) VALUES (?, NULL, NULL, 0, 0)',
        [opening.id],
      );

      let parentId: number = rootResult.lastInsertRowId as number;

      for (let i = 0; i < opening.moves.length; i++) {
        const ply = i + 1;
        // White moves on odd plies; black moves on even plies (ply ≥ 2).
        const isPlayerMove =
          opening.color === 'white' ? ply % 2 === 1 : ply % 2 === 0;

        const result = await db.runAsync(
          'INSERT INTO opening_nodes (opening_id, parent_id, move_san, ply, is_player_move) VALUES (?, ?, ?, ?, ?)',
          [opening.id, parentId, opening.moves[i], ply, isPlayerMove ? 1 : 0],
        );
        parentId = result.lastInsertRowId as number;
      }
    }
  });
}
