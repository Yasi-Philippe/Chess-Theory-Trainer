/**
 * Unit tests for the getEligibleSet filtering logic.
 * These test the algorithm in isolation using mock WDL values.
 */

import type { StockfishMove, WDL } from '../../types';

function wdl(win: number, draw: number, loss: number): WDL {
  return { win, draw, loss };
}

function move(uci: string, win: number, draw: number, loss: number): StockfishMove {
  return { uci, san: '', score: 0, wdl: wdl(win, draw, loss) };
}

function winProb(m: StockfishMove): number {
  const { win, draw, loss } = m.wdl;
  const total = win + draw + loss;
  return total === 0 ? 0 : win / total;
}

// Replicated from useStockfish.ts — the filtering algorithm under test
function filterEligible(candidates: StockfishMove[]): StockfishMove[] {
  if (candidates.length === 0) return [];
  const bestWin = winProb(candidates[0]);
  const threshold = bestWin * 0.9;
  return candidates.filter(m => {
    const w = winProb(m);
    if (bestWin > 0.5 && w < 0.5) return false;
    return w >= threshold;
  });
}

describe('getEligibleSet filtering algorithm', () => {
  it('returns all candidates when all are winning and within 10% of best', () => {
    const candidates = [
      move('e2e4', 700, 200, 100), // 70%
      move('d2d4', 680, 200, 120), // 68%
      move('c2c4', 650, 220, 130), // 65%
    ];
    const result = filterEligible(candidates);
    // threshold = 70% * 0.9 = 63%, all pass
    expect(result).toHaveLength(3);
  });

  it('discards move more than 10% below best', () => {
    const candidates = [
      move('e2e4', 800, 100, 100), // 80%
      move('d2d4', 700, 150, 150), // 70%
      move('c2c4', 500, 200, 300), // 50% — below 80*0.9=72%
    ];
    const result = filterEligible(candidates);
    expect(result).toHaveLength(2);
    expect(result.map(m => m.uci)).toEqual(['e2e4', 'd2d4']);
  });

  it('discards losing moves when winning moves exist (best > 50%)', () => {
    const candidates = [
      move('e2e4', 650, 200, 150), // 65% — winning
      move('d2d4', 600, 200, 200), // 60% — winning, within 10%
      move('h2h4', 450, 150, 400), // 45% — losing, discarded
    ];
    const result = filterEligible(candidates);
    expect(result).toHaveLength(2);
    expect(result.map(m => m.uci)).not.toContain('h2h4');
  });

  it('keeps all moves when position is losing (best <= 50%)', () => {
    const candidates = [
      move('e2e4', 450, 100, 450), // 45% — best but losing
      move('d2d4', 420, 100, 480), // 42% — within 10% of 45%
      move('c2c4', 300, 100, 600), // 30% — below threshold (45*0.9=40.5%)
    ];
    const result = filterEligible(candidates);
    // Losing position: no 50% filter applied, only 10% threshold
    expect(result).toHaveLength(2);
    expect(result.map(m => m.uci)).toContain('e2e4');
    expect(result.map(m => m.uci)).toContain('d2d4');
    expect(result.map(m => m.uci)).not.toContain('c2c4');
  });

  it('returns a single move when only one is eligible', () => {
    const candidates = [
      move('e2e4', 900, 50, 50),  // 90%
      move('d2d4', 500, 200, 300), // 50% — below 90*0.9=81%
      move('c2c4', 400, 200, 400), // 40% — also below 81%, also < 50%
    ];
    const result = filterEligible(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].uci).toBe('e2e4');
  });

  it('returns empty array for empty input', () => {
    expect(filterEligible([])).toHaveLength(0);
  });

  it('keeps move exactly at threshold (90% of best)', () => {
    const candidates = [
      move('e2e4', 700, 200, 100), // 70%
      move('d2d4', 630, 200, 170), // 63% — exactly 70 * 0.9
    ];
    const result = filterEligible(candidates);
    expect(result).toHaveLength(2);
  });

  it('discards move just below threshold', () => {
    const candidates = [
      move('e2e4', 1000, 0, 0), // 100%
      move('d2d4', 899, 0, 101), // 89.9% — just below 100*0.9=90%
    ];
    const result = filterEligible(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].uci).toBe('e2e4');
  });
});
