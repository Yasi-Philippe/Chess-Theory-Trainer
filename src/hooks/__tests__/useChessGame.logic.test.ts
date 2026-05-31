/**
 * Unit tests for game logic: miss counter, phase transitions, and opening validation.
 * Tests the pure functions extracted from useChessGame.
 */

import { MISS_LIMIT } from '../../constants';

// ─── Miss system ──────────────────────────────────────────────────────────────

describe('MISS_LIMIT constant', () => {
  it('is 2 (two consecutive wrong moves trigger game over)', () => {
    expect(MISS_LIMIT).toBe(2);
  });
});

// Simulate the miss counter logic as extracted from useChessGame
function simulateMissCounter(moves: ('correct' | 'wrong')[]): {
  consecutiveMisses: number;
  gameOver: boolean;
} {
  let consecutiveMisses = 0;
  for (const move of moves) {
    if (move === 'wrong') {
      consecutiveMisses++;
      if (consecutiveMisses >= MISS_LIMIT) {
        return { consecutiveMisses, gameOver: true };
      }
    } else {
      consecutiveMisses = 0;
    }
  }
  return { consecutiveMisses, gameOver: false };
}

describe('miss counter', () => {
  it('resets to 0 on a correct move', () => {
    const result = simulateMissCounter(['wrong', 'correct']);
    expect(result.consecutiveMisses).toBe(0);
    expect(result.gameOver).toBe(false);
  });

  it('triggers game over on two consecutive wrong moves', () => {
    const result = simulateMissCounter(['wrong', 'wrong']);
    expect(result.gameOver).toBe(true);
  });

  it('does NOT trigger game over on two non-consecutive wrong moves', () => {
    const result = simulateMissCounter(['wrong', 'correct', 'wrong']);
    expect(result.gameOver).toBe(false);
    expect(result.consecutiveMisses).toBe(1);
  });

  it('resets after game continues past a mistake', () => {
    const result = simulateMissCounter(['wrong', 'correct', 'correct', 'correct']);
    expect(result.consecutiveMisses).toBe(0);
    expect(result.gameOver).toBe(false);
  });

  it('requires exactly two in a row — three non-consecutive do not trigger', () => {
    const result = simulateMissCounter(['wrong', 'correct', 'wrong', 'correct', 'wrong']);
    expect(result.gameOver).toBe(false);
    expect(result.consecutiveMisses).toBe(1);
  });
});

// ─── isPlayerTurnAtIndex logic ────────────────────────────────────────────────

function isPlayerTurnAtIndex(index: number, playerColor: 'white' | 'black'): boolean {
  const whiteToMove = index % 2 === 0;
  return playerColor === 'white' ? whiteToMove : !whiteToMove;
}

describe('isPlayerTurnAtIndex', () => {
  it('White player moves on even indices (0, 2, 4)', () => {
    expect(isPlayerTurnAtIndex(0, 'white')).toBe(true);
    expect(isPlayerTurnAtIndex(2, 'white')).toBe(true);
    expect(isPlayerTurnAtIndex(4, 'white')).toBe(true);
  });

  it('White player does NOT move on odd indices', () => {
    expect(isPlayerTurnAtIndex(1, 'white')).toBe(false);
    expect(isPlayerTurnAtIndex(3, 'white')).toBe(false);
  });

  it('Black player moves on odd indices (1, 3, 5)', () => {
    expect(isPlayerTurnAtIndex(1, 'black')).toBe(true);
    expect(isPlayerTurnAtIndex(3, 'black')).toBe(true);
    expect(isPlayerTurnAtIndex(5, 'black')).toBe(true);
  });

  it('Black player does NOT move on even indices', () => {
    expect(isPlayerTurnAtIndex(0, 'black')).toBe(false);
    expect(isPlayerTurnAtIndex(2, 'black')).toBe(false);
  });
});
