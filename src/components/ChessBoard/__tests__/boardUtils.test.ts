import { squareToXY, xyToSquare } from '../boardUtils';

const SQ = 60; // arbitrary square size for tests

// ─── squareToXY ───────────────────────────────────────────────────────────────

describe('squareToXY — white perspective (flipped=false)', () => {
  it('a8 is top-left (0, 0)', () => {
    expect(squareToXY('a8', SQ, false)).toEqual({ x: 0, y: 0 });
  });
  it('h8 is top-right (7*SQ, 0)', () => {
    expect(squareToXY('h8', SQ, false)).toEqual({ x: 7 * SQ, y: 0 });
  });
  it('a1 is bottom-left (0, 7*SQ)', () => {
    expect(squareToXY('a1', SQ, false)).toEqual({ x: 0, y: 7 * SQ });
  });
  it('h1 is bottom-right (7*SQ, 7*SQ)', () => {
    expect(squareToXY('h1', SQ, false)).toEqual({ x: 7 * SQ, y: 7 * SQ });
  });
  it('e4 is correct mid-board square', () => {
    // e=file index 4, rank 4 → rank index 3 → y = (7-3)*SQ = 4*SQ
    expect(squareToXY('e4', SQ, false)).toEqual({ x: 4 * SQ, y: 4 * SQ });
  });
});

describe('squareToXY — black perspective (flipped=true)', () => {
  it('h1 is top-left (0, 0)', () => {
    expect(squareToXY('h1', SQ, true)).toEqual({ x: 0, y: 0 });
  });
  it('a1 is top-right (7*SQ, 0)', () => {
    expect(squareToXY('a1', SQ, true)).toEqual({ x: 7 * SQ, y: 0 });
  });
  it('h8 is bottom-left (0, 7*SQ)', () => {
    expect(squareToXY('h8', SQ, true)).toEqual({ x: 0, y: 7 * SQ });
  });
  it('a8 is bottom-right (7*SQ, 7*SQ)', () => {
    expect(squareToXY('a8', SQ, true)).toEqual({ x: 7 * SQ, y: 7 * SQ });
  });
});

// ─── xyToSquare ───────────────────────────────────────────────────────────────

describe('xyToSquare — white perspective (flipped=false)', () => {
  it('top-left pixel → a8', () => {
    expect(xyToSquare(0, 0, SQ, false)).toBe('a8');
  });
  it('bottom-right pixel (inside last square) → h1', () => {
    expect(xyToSquare(7 * SQ + 1, 7 * SQ + 1, SQ, false)).toBe('h1');
  });
  it('out of bounds returns null', () => {
    expect(xyToSquare(-1, 0, SQ, false)).toBeNull();
    expect(xyToSquare(0, -1, SQ, false)).toBeNull();
    expect(xyToSquare(8 * SQ, 0, SQ, false)).toBeNull();
    expect(xyToSquare(0, 8 * SQ, SQ, false)).toBeNull();
  });
});

describe('xyToSquare — black perspective (flipped=true)', () => {
  it('top-left pixel → h1', () => {
    expect(xyToSquare(0, 0, SQ, true)).toBe('h1');
  });
  it('bottom-right pixel → a8', () => {
    expect(xyToSquare(7 * SQ + 1, 7 * SQ + 1, SQ, true)).toBe('a8');
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('squareToXY / xyToSquare round-trip', () => {
  const squares = ['a1', 'a8', 'h1', 'h8', 'e4', 'd5', 'c3', 'f6'] as const;
  const orientations = [false, true];

  for (const flipped of orientations) {
    for (const sq of squares) {
      it(`${sq} flipped=${flipped} round-trips correctly`, () => {
        const { x, y } = squareToXY(sq, SQ, flipped);
        // Use center of square to avoid edge ambiguity
        const result = xyToSquare(x + SQ / 2, y + SQ / 2, SQ, flipped);
        expect(result).toBe(sq);
      });
    }
  }
});
