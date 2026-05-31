/**
 * Tests for Stockfish UCI output parsing (parseInfoLine).
 * These are pure function tests — no WebView needed.
 */

import type { StockfishMove } from '../../types';

// Replicated from useStockfish.ts (the function is not exported; we test it here by duplicating it)
function parseInfoLine(line: string): { rank: number; move: StockfishMove } | null {
  if (!line.startsWith('info') || !line.includes('multipv') || !line.includes(' pv ')) {
    return null;
  }
  const multipvMatch = line.match(/multipv (\d+)/);
  const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
  const cpMatch = line.match(/score cp (-?\d+)/);
  const mateMatch = line.match(/score mate (-?\d+)/);
  const wdlMatch = line.match(/wdl (\d+) (\d+) (\d+)/);

  if (!multipvMatch || !pvMatch) return null;

  const rank = parseInt(multipvMatch[1], 10);
  const uci = pvMatch[1];

  let score = 0;
  if (mateMatch) {
    score = parseInt(mateMatch[1], 10) > 0 ? 30000 : -30000;
  } else if (cpMatch) {
    score = parseInt(cpMatch[1], 10);
  }

  const wdl = wdlMatch
    ? { win: parseInt(wdlMatch[1], 10), draw: parseInt(wdlMatch[2], 10), loss: parseInt(wdlMatch[3], 10) }
    : { win: 500, draw: 0, loss: 500 };

  return { rank, move: { uci, san: '', score, wdl } };
}

describe('parseInfoLine', () => {
  it('parses a standard info line with cp score and wdl', () => {
    const line = 'info depth 8 seldepth 10 multipv 1 score cp 35 wdl 550 300 150 nodes 12345 pv e2e4 e7e5';
    const result = parseInfoLine(line);
    expect(result).not.toBeNull();
    expect(result!.rank).toBe(1);
    expect(result!.move.uci).toBe('e2e4');
    expect(result!.move.score).toBe(35);
    expect(result!.move.wdl).toEqual({ win: 550, draw: 300, loss: 150 });
  });

  it('parses multipv 2 correctly', () => {
    const line = 'info depth 8 multipv 2 score cp 10 wdl 490 350 160 pv d2d4 d7d5';
    const result = parseInfoLine(line);
    expect(result!.rank).toBe(2);
    expect(result!.move.uci).toBe('d2d4');
  });

  it('parses negative cp score', () => {
    const line = 'info depth 8 multipv 1 score cp -45 wdl 200 300 500 pv e7e5 e2e4';
    const result = parseInfoLine(line);
    expect(result!.move.score).toBe(-45);
  });

  it('parses mate score as 30000', () => {
    const line = 'info depth 8 multipv 1 score mate 3 wdl 1000 0 0 pv d1h5 f7f6 h5f7';
    const result = parseInfoLine(line);
    expect(result!.move.score).toBe(30000);
  });

  it('parses negative mate score as -30000', () => {
    const line = 'info depth 8 multipv 1 score mate -2 wdl 0 0 1000 pv e1g1';
    const result = parseInfoLine(line);
    expect(result!.move.score).toBe(-30000);
  });

  it('uses default wdl when missing', () => {
    const line = 'info depth 8 multipv 1 score cp 0 pv e2e4 e7e5';
    const result = parseInfoLine(line);
    expect(result!.move.wdl).toEqual({ win: 500, draw: 0, loss: 500 });
  });

  it('parses promotion move UCI', () => {
    const line = 'info depth 8 multipv 1 score cp 900 wdl 990 5 5 pv a7a8q e8d7';
    const result = parseInfoLine(line);
    expect(result!.move.uci).toBe('a7a8q');
  });

  it('returns null for non-info lines', () => {
    expect(parseInfoLine('bestmove e2e4 ponder e7e5')).toBeNull();
    expect(parseInfoLine('readyok')).toBeNull();
    expect(parseInfoLine('uciok')).toBeNull();
  });

  it('returns null for info line without multipv', () => {
    const line = 'info depth 8 score cp 35 pv e2e4';
    expect(parseInfoLine(line)).toBeNull();
  });

  it('returns null for info line without pv', () => {
    const line = 'info depth 8 multipv 1 score cp 35 nodes 1000';
    expect(parseInfoLine(line)).toBeNull();
  });
});
