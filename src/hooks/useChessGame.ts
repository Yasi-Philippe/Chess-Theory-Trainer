import { useState, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Opening, OpeningMode, PlayerColor, GamePhase, StockfishMove } from '../types';
import { weightedRandomMove } from './useStockfish';

export interface PlayerMoveResult {
  outcome: 'accepted' | 'wrong_move' | 'illegal';
  engineMove?: { from: Square; to: Square; promotion?: string };
  gameOver?: boolean;
  gameOverReason?: 'two_misses' | 'completed';
}

interface UseChessGameParams {
  opening: Opening;
  playerColor: PlayerColor;
  mode: OpeningMode;
  getBestMove: (fen: string, color: PlayerColor) => Promise<StockfishMove[]>;
  getTopMove: (fen: string, color: PlayerColor) => Promise<StockfishMove>;
}

export interface ChessGameState {
  phase: GamePhase;
  moveCount: number;
  consecutiveMisses: number;
  feedbackMessage: string | null;
  openingMoveIndex: number;
  /** FEN of the last accepted position — used by the screen to reset the board on undo */
  lastValidFen: string;
  /** FEN the board should start with */
  startingFen: string;
}

/**
 * Builds the FEN for the position at the start of the game.
 * In 'from_position' mode, we fast-forward through all opening moves.
 * In 'play_through' mode, we start from the standard starting position.
 */
function buildStartingFen(opening: Opening, mode: OpeningMode): string {
  if (mode !== 'from_position') return new Chess().fen();
  const chess = new Chess();
  for (const san of opening.moves) {
    try {
      chess.move(san);
    } catch {
      break;
    }
  }
  return chess.fen();
}

/** Converts a UCI string like "e2e4" or "e7e8q" into { from, to, promotion } */
function uciToSquares(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

export function useChessGame({
  opening,
  playerColor,
  mode,
  getBestMove,
  getTopMove,
}: UseChessGameParams) {
  /** Our chess.js instance is the source of truth for positions we send to Stockfish */
  const chessRef = useRef<Chess>(new Chess(buildStartingFen(opening, mode)));

  const startingFen = buildStartingFen(opening, mode);
  const engineColor: PlayerColor = playerColor === 'white' ? 'black' : 'white';

  const [state, setState] = useState<ChessGameState>({
    phase: mode === 'play_through' ? 'OPENING_PHASE' : 'GAME_PHASE',
    moveCount: 0,
    consecutiveMisses: 0,
    feedbackMessage: null,
    openingMoveIndex: 0,
    lastValidFen: startingFen,
    startingFen,
  });

  /** Prevents re-entrant processing while async validation is running */
  const processingRef = useRef(false);

  // ─── Private helpers ──────────────────────────────────────────────────────

  async function fetchEngineMove(): Promise<{ from: Square; to: Square; promotion?: string } | null> {
    const fen = chessRef.current.fen();
    try {
      const topMoves = await getBestMove(fen, engineColor);
      if (topMoves.length === 0) return null;
      const chosen = weightedRandomMove(topMoves);
      // Apply to our internal chess instance so the FEN stays up to date
      const move = chessRef.current.move(chosen.uci);
      if (!move) return null;
      return uciToSquares(chosen.uci);
    } catch {
      return null;
    }
  }

  // ─── Opening phase ────────────────────────────────────────────────────────

  function handleOpeningMove(from: Square, to: Square, promotion?: string): PlayerMoveResult {
    const { openingMoveIndex, consecutiveMisses } = state;
    const expectedSan = opening.moves[openingMoveIndex];

    // Attempt the move on a clone to see if it matches the expected SAN
    const clone = new Chess(chessRef.current.fen());
    let move = null;
    try {
      move = clone.move({ from, to, promotion: promotion as any });
    } catch {
      return { outcome: 'illegal' };
    }

    if (!move || move.san !== expectedSan) {
      const newMisses = consecutiveMisses + 1;
      if (newMisses >= 2) {
        setState(prev => ({
          ...prev,
          consecutiveMisses: newMisses,
          phase: 'GAME_OVER',
          feedbackMessage: 'Game over! Two misses.',
        }));
        return { outcome: 'wrong_move', gameOver: true, gameOverReason: 'two_misses' };
      }
      setState(prev => ({
        ...prev,
        consecutiveMisses: newMisses,
        feedbackMessage: `Wrong! Expected: ${expectedSan}. You have ${2 - newMisses} chance(s) left.`,
      }));
      return { outcome: 'wrong_move' };
    }

    // Apply the player's move to our engine
    chessRef.current.move({ from, to, promotion: promotion as any });
    const newIndex = openingMoveIndex + 1;
    const lastValidFen = chessRef.current.fen();
    const isComplete = newIndex >= opening.moves.length;

    if (isComplete) {
      setState(prev => ({
        ...prev,
        openingMoveIndex: newIndex,
        consecutiveMisses: 0,
        moveCount: prev.moveCount + 1,
        phase: 'ENGINE_TURN',
        feedbackMessage: 'Opening complete! Now find the best moves.',
        lastValidFen,
      }));
      return { outcome: 'accepted' };
    }

    // Auto-apply the opponent's opening reply
    const opponentSan = opening.moves[newIndex];
    let opponentMove = null;
    try {
      opponentMove = chessRef.current.move(opponentSan);
    } catch {
      opponentMove = null;
    }

    const nextIndex = opponentMove ? newIndex + 1 : newIndex;
    const nextComplete = nextIndex >= opening.moves.length;
    const newLastValidFen = chessRef.current.fen();

    setState(prev => ({
      ...prev,
      openingMoveIndex: nextIndex,
      consecutiveMisses: 0,
      moveCount: prev.moveCount + 1,
      phase: nextComplete ? 'ENGINE_TURN' : 'OPENING_PHASE',
      feedbackMessage: null,
      lastValidFen: newLastValidFen,
    }));

    const engineMoveSquares = opponentMove
      ? uciToSquares(`${opponentMove.from}${opponentMove.to}${opponentMove.promotion ?? ''}`)
      : undefined;

    return { outcome: 'accepted', engineMove: engineMoveSquares };
  }

  // ─── Game phase ───────────────────────────────────────────────────────────

  async function handleGameMove(from: Square, to: Square, promotion?: string): Promise<PlayerMoveResult> {
    const fen = chessRef.current.fen();
    let topMove: StockfishMove;
    try {
      topMove = await getTopMove(fen, playerColor);
    } catch {
      return { outcome: 'illegal' };
    }

    const playedUci = `${from}${to}${promotion ?? ''}`;
    const isBestMove = playedUci === topMove.uci;

    if (!isBestMove) {
      const newMisses = state.consecutiveMisses + 1;
      if (newMisses >= 2) {
        setState(prev => ({
          ...prev,
          consecutiveMisses: newMisses,
          phase: 'GAME_OVER',
          feedbackMessage: 'Game over! Two misses.',
        }));
        return { outcome: 'wrong_move', gameOver: true, gameOverReason: 'two_misses' };
      }
      setState(prev => ({
        ...prev,
        consecutiveMisses: newMisses,
        feedbackMessage: `Not the best move. One more chance!`,
      }));
      return { outcome: 'wrong_move' };
    }

    // Accept player move
    chessRef.current.move({ from, to, promotion: promotion as any });
    const lastValidFen = chessRef.current.fen();

    if (chessRef.current.isGameOver()) {
      setState(prev => ({
        ...prev,
        consecutiveMisses: 0,
        moveCount: prev.moveCount + 1,
        phase: 'GAME_OVER',
        feedbackMessage: 'Game complete!',
        lastValidFen,
      }));
      return { outcome: 'accepted', gameOver: true, gameOverReason: 'completed' };
    }

    setState(prev => ({
      ...prev,
      consecutiveMisses: 0,
      moveCount: prev.moveCount + 1,
      phase: 'ENGINE_TURN',
      feedbackMessage: 'Best move!',
      lastValidFen,
    }));

    return { outcome: 'accepted' };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Called by the screen after the player drags a piece on the board.
   * Returns what happened so the screen can react (undo board, trigger engine move, etc.)
   */
  const onPlayerMove = useCallback(
    async (from: Square, to: Square, promotion?: string): Promise<PlayerMoveResult> => {
      if (processingRef.current) return { outcome: 'illegal' };
      if (state.phase !== 'OPENING_PHASE' && state.phase !== 'GAME_PHASE') {
        return { outcome: 'illegal' };
      }
      processingRef.current = true;
      try {
        if (state.phase === 'OPENING_PHASE') {
          return handleOpeningMove(from, to, promotion);
        }
        return await handleGameMove(from, to, promotion);
      } finally {
        processingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );

  /**
   * Called by the screen after it has successfully animated the engine's opening reply.
   * Triggers Stockfish to compute the next engine move when transitioning to GAME_PHASE.
   */
  const requestEngineMove = useCallback(async (): Promise<{
    from: Square;
    to: Square;
    promotion?: string;
  } | null> => {
    const engineMove = await fetchEngineMove();
    if (engineMove) {
      const newLastValidFen = chessRef.current.fen();
      setState(prev => ({
        ...prev,
        phase: chessRef.current.isGameOver() ? 'GAME_OVER' : 'GAME_PHASE',
        moveCount: prev.moveCount + 1,
        lastValidFen: newLastValidFen,
        feedbackMessage: null,
      }));
    }
    return engineMove;
  }, [getBestMove]);

  const resetGame = useCallback(() => {
    const newFen = buildStartingFen(opening, mode);
    chessRef.current = new Chess(newFen);
    setState({
      phase: mode === 'play_through' ? 'OPENING_PHASE' : 'GAME_PHASE',
      moveCount: 0,
      consecutiveMisses: 0,
      feedbackMessage: null,
      openingMoveIndex: 0,
      lastValidFen: newFen,
      startingFen: newFen,
    });
  }, [opening, mode]);

  return { state, onPlayerMove, requestEngineMove, resetGame };
}
