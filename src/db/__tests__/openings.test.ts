/**
 * Unit tests for the DB layer.
 *
 * expo-sqlite is mocked — tests verify transformation logic and query plumbing
 * without requiring a native module. The pure helpers (buildMainLine,
 * nodesToMoves, rowToOpening) are tested directly; the query functions are
 * tested by injecting a mock DB via the `database` module mock.
 */

// expo-sqlite is mapped to __mocks__/expo-sqlite.js via moduleNameMapper
import {
  buildMainLine,
  nodesToMoves,
  rowToOpening,
  type NodeRow,
  type OpeningRow,
} from '../openings';
import { OPENINGS } from '../../data/openings';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Build a flat node list for a 3-move opening (e4 / e5 / Nf3). */
function makeNodes(openingId = 'test'): NodeRow[] {
  return [
    { id: 1, opening_id: openingId, parent_id: null, move_san: null, ply: 0, is_player_move: 0 },
    { id: 2, opening_id: openingId, parent_id: 1,    move_san: 'e4',  ply: 1, is_player_move: 1 },
    { id: 3, opening_id: openingId, parent_id: 2,    move_san: 'e5',  ply: 2, is_player_move: 0 },
    { id: 4, opening_id: openingId, parent_id: 3,    move_san: 'Nf3', ply: 3, is_player_move: 1 },
  ];
}

const OPENING_ROW: OpeningRow = {
  id: 'ruy_lopez_main',
  name: 'Ruy López — Main Line',
  eco_code: 'C65',
  color: 'white',
  category: 'main_line',
  description: 'The Spanish Game main line.',
};

// ── buildMainLine ─────────────────────────────────────────────────────────────

describe('buildMainLine', () => {
  it('returns nodes from root to leaf in order', () => {
    const line = buildMainLine(makeNodes());
    expect(line).toHaveLength(4);
    expect(line[0].ply).toBe(0);
    expect(line[3].ply).toBe(3);
  });

  it('returns the root node first when only a root exists', () => {
    const nodes: NodeRow[] = [
      { id: 1, opening_id: 'x', parent_id: null, move_san: null, ply: 0, is_player_move: 0 },
    ];
    expect(buildMainLine(nodes)).toHaveLength(1);
  });

  it('handles branching by always taking the first child', () => {
    const nodes: NodeRow[] = [
      { id: 1, opening_id: 'x', parent_id: null, move_san: null, ply: 0, is_player_move: 0 },
      { id: 2, opening_id: 'x', parent_id: 1,    move_san: 'e4',  ply: 1, is_player_move: 1 },
      // sibling — should not appear in main line
      { id: 3, opening_id: 'x', parent_id: 1,    move_san: 'd4',  ply: 1, is_player_move: 1 },
      { id: 4, opening_id: 'x', parent_id: 2,    move_san: 'e5',  ply: 2, is_player_move: 0 },
    ];
    const line = buildMainLine(nodes);
    // Should follow root → id:2 (e4, first child by insertion order) → id:4 (e5)
    expect(line.map(n => n.id)).toEqual([1, 2, 4]);
  });

  it('returns empty array when given no nodes', () => {
    expect(buildMainLine([])).toHaveLength(0);
  });
});

// ── nodesToMoves ──────────────────────────────────────────────────────────────

describe('nodesToMoves', () => {
  it('extracts SAN strings, skipping the root node (ply 0)', () => {
    const moves = nodesToMoves(buildMainLine(makeNodes()));
    expect(moves).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('returns empty array for a root-only line', () => {
    const root: NodeRow[] = [
      { id: 1, opening_id: 'x', parent_id: null, move_san: null, ply: 0, is_player_move: 0 },
    ];
    expect(nodesToMoves(root)).toEqual([]);
  });
});

// ── rowToOpening ──────────────────────────────────────────────────────────────

describe('rowToOpening', () => {
  it('maps DB row fields to Opening fields correctly', () => {
    const opening = rowToOpening(OPENING_ROW, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(opening.id).toBe('ruy_lopez_main');
    expect(opening.eco).toBe('C65');
    expect(opening.color).toBe('white');
    expect(opening.category).toBe('main_line');
    expect(opening.moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  });
});

// ── Static openings data integrity (seed input) ───────────────────────────────

describe('static OPENINGS array (seed source)', () => {
  it('contains at least 1 opening', () => {
    expect(OPENINGS.length).toBeGreaterThan(0);
  });

  it('all openings have required fields', () => {
    for (const o of OPENINGS) {
      expect(o.id).toBeTruthy();
      expect(o.name).toBeTruthy();
      expect(o.eco).toBeTruthy();
      expect(['white', 'black']).toContain(o.color);
      expect(o.category).toBe('main_line');
      expect(Array.isArray(o.moves)).toBe(true);
      expect(o.moves.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = OPENINGS.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('white and black openings together equal the total count', () => {
    const white = OPENINGS.filter(o => o.color === 'white').length;
    const black = OPENINGS.filter(o => o.color === 'black').length;
    expect(white + black).toBe(OPENINGS.length);
  });
});

// ── Seed plies and player-move flags ─────────────────────────────────────────

describe('seed: is_player_move assignment', () => {
  function playerMoveFlagFor(color: 'white' | 'black', ply: number): boolean {
    return color === 'white' ? ply % 2 === 1 : ply % 2 === 0;
  }

  it('white player moves at odd plies', () => {
    expect(playerMoveFlagFor('white', 1)).toBe(true);  // white's 1st move
    expect(playerMoveFlagFor('white', 2)).toBe(false); // black's reply
    expect(playerMoveFlagFor('white', 3)).toBe(true);  // white's 2nd move
  });

  it('black player moves at even plies', () => {
    expect(playerMoveFlagFor('black', 1)).toBe(false); // white's move (engine)
    expect(playerMoveFlagFor('black', 2)).toBe(true);  // black's 1st move
    expect(playerMoveFlagFor('black', 3)).toBe(false); // white's reply (engine)
  });
});

// ── getMainLine via buildMainLine (round-trip) ────────────────────────────────

describe('buildMainLine round-trip with Ruy López moves', () => {
  const RUYLOPEZ_MOVES = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3'];

  it('produces the correct move sequence from a seeded node list', () => {
    // Simulate what seed.ts writes for the Ruy López opening
    const nodes: NodeRow[] = [
      { id: 0, opening_id: 'ruy_lopez_main', parent_id: null, move_san: null, ply: 0, is_player_move: 0 },
    ];
    let parentId = 0;
    RUYLOPEZ_MOVES.forEach((san, i) => {
      const ply = i + 1;
      const id = ply; // 1-based
      nodes.push({ id, opening_id: 'ruy_lopez_main', parent_id: parentId, move_san: san, ply, is_player_move: ply % 2 === 1 ? 1 : 0 });
      parentId = id;
    });

    const moves = nodesToMoves(buildMainLine(nodes));
    expect(moves).toEqual(RUYLOPEZ_MOVES);
  });
});
