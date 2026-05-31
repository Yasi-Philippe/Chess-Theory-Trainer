import type { Opening, PlayerColor, OpeningCategory } from '../types';
import { getDb } from './database';

// ── Row types (internal) ──────────────────────────────────────────────────────

export interface OpeningRow {
  id: string;
  name: string;
  eco_code: string;
  color: string;
  category: string;
  description: string;
}

export interface NodeRow {
  id: number;
  opening_id: string; // used for grouping in getByCategory
  parent_id: number | null;
  move_san: string | null;
  ply: number;
  is_player_move: number;
}

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/** Traverse node array and return the main line (always takes the first child). */
export function buildMainLine(nodes: NodeRow[]): NodeRow[] {
  const childrenMap = new Map<number | null, NodeRow[]>();
  for (const node of nodes) {
    const key = node.parent_id ?? null;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(node);
  }
  const line: NodeRow[] = [];
  let current = childrenMap.get(null)?.[0];
  while (current) {
    line.push(current);
    const children = childrenMap.get(current.id) ?? [];
    current = children[0];
  }
  return line;
}

/** Extract SAN moves from a main-line node list (skips root, which has no move). */
export function nodesToMoves(nodes: NodeRow[]): string[] {
  return nodes
    .filter(n => n.ply > 0 && n.move_san !== null)
    .map(n => n.move_san!);
}

export function rowToOpening(row: OpeningRow, moves: string[]): Opening {
  return {
    id: row.id,
    name: row.name,
    eco: row.eco_code,
    color: row.color as PlayerColor,
    category: row.category as OpeningCategory,
    moves,
    description: row.description,
  };
}

// ── Query functions ───────────────────────────────────────────────────────────

export async function getCategories(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ category: string }>(
    'SELECT DISTINCT category FROM openings ORDER BY category',
  );
  return rows.map((r: { category: string }) => r.category);
}

export async function getByCategory(
  category: string,
  color?: PlayerColor,
): Promise<Opening[]> {
  const db = await getDb();
  const params: string[] = [category];
  let sql = 'SELECT * FROM openings WHERE category = ?';
  if (color) {
    sql += ' AND color = ?';
    params.push(color);
  }
  sql += ' ORDER BY name';

  const rows = await db.getAllAsync<OpeningRow>(sql, params);
  if (rows.length === 0) return [];

  // Fetch all nodes for the matched openings in a single parameterized query (avoids N+1).
  const placeholders = rows.map(() => '?').join(',');
  const nodes = await db.getAllAsync<NodeRow>(
    `SELECT * FROM opening_nodes WHERE opening_id IN (${placeholders}) ORDER BY opening_id, ply, id`,
    rows.map(r => r.id),
  );

  const nodesByOpening = new Map<string, NodeRow[]>();
  for (const node of nodes) {
    if (!nodesByOpening.has(node.opening_id)) nodesByOpening.set(node.opening_id, []);
    nodesByOpening.get(node.opening_id)!.push(node);
  }

  return rows.map(row => {
    const openingNodes = nodesByOpening.get(row.id) ?? [];
    const moves = nodesToMoves(buildMainLine(openingNodes));
    return rowToOpening(row, moves);
  });
}

export async function getById(id: string): Promise<Opening | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<OpeningRow>(
    'SELECT * FROM openings WHERE id = ?',
    [id],
  );
  if (!row) return null;
  const moves = await _getMainLineMoves(db, id);
  return rowToOpening(row, moves);
}

export async function getChildren(nodeId: number): Promise<NodeRow[]> {
  const db = await getDb();
  return db.getAllAsync<NodeRow>(
    'SELECT * FROM opening_nodes WHERE parent_id = ? ORDER BY id',
    [nodeId],
  );
}

export async function getMainLine(openingId: string): Promise<NodeRow[]> {
  const db = await getDb();
  const nodes = await db.getAllAsync<NodeRow>(
    'SELECT * FROM opening_nodes WHERE opening_id = ? ORDER BY ply, id',
    [openingId],
  );
  return buildMainLine(nodes);
}

export async function getAllVariantMoves(
  openingId: string,
  ply: number,
): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ move_san: string }>(
    'SELECT move_san FROM opening_nodes WHERE opening_id = ? AND ply = ? AND move_san IS NOT NULL',
    [openingId, ply],
  );
  return rows.map((r: { move_san: string }) => r.move_san);
}

async function _getMainLineMoves(
  db: Awaited<ReturnType<typeof getDb>>,
  openingId: string,
): Promise<string[]> {
  const nodes = await db.getAllAsync<NodeRow>(
    'SELECT * FROM opening_nodes WHERE opening_id = ? ORDER BY ply, id',
    [openingId],
  );
  return nodesToMoves(buildMainLine(nodes));
}
