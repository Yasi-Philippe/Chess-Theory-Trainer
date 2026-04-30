/**
 * useBoardLogic tests.
 *
 * We test the pure chess.js interactions by calling the hook's returned
 * functions directly via renderHook.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useBoardLogic } from '../useBoardLogic';

// Starting FEN
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Position after 1.e4: chess.js v1 omits e.p. square when no capture is possible
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('useBoardLogic — initial state', () => {
  it('starts at the standard opening position', () => {
    const { result } = renderHook(() => useBoardLogic());
    expect(result.current.fen).toBe(START_FEN);
    expect(result.current.turn).toBe('w');
    expect(result.current.inCheck).toBe(false);
    expect(result.current.lastMove).toBeNull();
  });

  it('has 32 pieces at start', () => {
    const { result } = renderHook(() => useBoardLogic());
    expect(result.current.pieces).toHaveLength(32);
  });

  it('loads a custom FEN when provided', () => {
    const { result } = renderHook(() => useBoardLogic(AFTER_E4));
    expect(result.current.turn).toBe('b');
    expect(result.current.pieces).toHaveLength(32);
  });
});

describe('useBoardLogic — getValidMoves', () => {
  it('e2 pawn can move to e3 and e4 from start', () => {
    const { result } = renderHook(() => useBoardLogic());
    const moves = result.current.getValidMoves('e2');
    expect(moves).toContain('e3');
    expect(moves).toContain('e4');
    expect(moves).toHaveLength(2);
  });

  it('returns no moves for an empty square', () => {
    const { result } = renderHook(() => useBoardLogic());
    expect(result.current.getValidMoves('e4')).toHaveLength(0);
  });

  it('returns no moves for an enemy piece (White to move, Black piece)', () => {
    const { result } = renderHook(() => useBoardLogic());
    // a7 has a black pawn; it's White's turn → no moves
    expect(result.current.getValidMoves('a7')).toHaveLength(0);
  });

  it('knight on b1 has 2 valid moves at start', () => {
    const { result } = renderHook(() => useBoardLogic());
    const moves = result.current.getValidMoves('b1');
    expect(moves).toContain('a3');
    expect(moves).toContain('c3');
    expect(moves).toHaveLength(2);
  });
});

describe('useBoardLogic — executeMove', () => {
  it('a valid move succeeds and updates FEN, turn, and lastMove', () => {
    const { result } = renderHook(() => useBoardLogic());
    act(() => {
      const r = result.current.executeMove({ from: 'e2', to: 'e4' });
      expect(r.success).toBe(true);
      expect(r.captured).toBe(false);
    });
    expect(result.current.turn).toBe('b');
    expect(result.current.lastMove).toEqual({ from: 'e2', to: 'e4' });
    expect(result.current.fen).toBe(AFTER_E4);
  });

  it('an illegal move fails and does not change state', () => {
    const { result } = renderHook(() => useBoardLogic());
    const fenBefore = result.current.fen;
    act(() => {
      const r = result.current.executeMove({ from: 'e2', to: 'e5' }); // illegal
      expect(r.success).toBe(false);
    });
    expect(result.current.fen).toBe(fenBefore);
    expect(result.current.turn).toBe('w');
    expect(result.current.lastMove).toBeNull();
  });

  it('a capture sets result.captured to true', () => {
    // Scholars mate setup: e4, e5, Qh5, Nc6, Bc4, Nf6, Qxf7 capture
    const beforeCapture = '2kr3r/ppppbppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQ - 4 5';
    const { result } = renderHook(() => useBoardLogic(beforeCapture));
    act(() => {
      const r = result.current.executeMove({ from: 'h5', to: 'f7' });
      expect(r.success).toBe(true);
      expect(r.captured).toBe(true);
    });
  });

  it('turn alternates correctly after each move', () => {
    const { result } = renderHook(() => useBoardLogic());
    expect(result.current.turn).toBe('w');
    act(() => { result.current.executeMove({ from: 'e2', to: 'e4' }); });
    expect(result.current.turn).toBe('b');
    act(() => { result.current.executeMove({ from: 'e7', to: 'e5' }); });
    expect(result.current.turn).toBe('w');
  });
});

describe('useBoardLogic — resetBoard', () => {
  it('resets to starting position', () => {
    const { result } = renderHook(() => useBoardLogic());
    act(() => { result.current.executeMove({ from: 'e2', to: 'e4' }); });
    act(() => { result.current.resetBoard(); });
    expect(result.current.fen).toBe(START_FEN);
    expect(result.current.turn).toBe('w');
    expect(result.current.lastMove).toBeNull();
    expect(result.current.pieces).toHaveLength(32);
  });

  it('resets to a provided FEN', () => {
    const { result } = renderHook(() => useBoardLogic());
    act(() => { result.current.resetBoard(AFTER_E4); });
    expect(result.current.turn).toBe('b');
    expect(result.current.lastMove).toBeNull();
  });
});

describe('useBoardLogic — check detection', () => {
  // Position: White queen on f7 giving check to Black king on e8
  const CHECK_FEN = 'r1bk3r/ppppQppp/8/8/8/8/PPPP1PPP/RNB1KBNR b KQ - 0 1';

  it('detects check correctly', () => {
    const { result } = renderHook(() => useBoardLogic(CHECK_FEN));
    expect(result.current.inCheck).toBe(true);
    expect(result.current.checkedKingSquare).toBe('d8');
  });

  it('no check at starting position', () => {
    const { result } = renderHook(() => useBoardLogic());
    expect(result.current.inCheck).toBe(false);
    expect(result.current.checkedKingSquare).toBeNull();
  });
});
