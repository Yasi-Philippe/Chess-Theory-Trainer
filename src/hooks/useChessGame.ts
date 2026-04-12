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
  opening: Opening | null;
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
  /** FEN of the last accepted position — used by the screen to reset the board on wrong move */
  lastValidFen: string;
  /** FEN the board started from (initial) */
  startingFen: string;
}

const INITIAL_FEN = new Chess().fen();

/** Returns true if it is the player's turn at this opening move index */
function isPlayerTurnAtIndex(index: number, playerColor: PlayerColor): boolean {
  // Even indices (0, 2, 4…) are White's moves; odd indices are Black's
  const whiteToMove = index % 2 === 0;
  return playerColor === 'white' ? whiteToMove : !whiteToMove;
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
  const chessRef = useRef<Chess>(new Chess());
  const engineColor: PlayerColor = playerColor === 'white' ? 'black' : 'white';

  const getInitialPhase = (): GamePhase => {
    if (mode === 'free') return 'GAME_PHASE';
    // Theory mode: if opening exists and it's the opponent's turn first (player is Black),
    // we need to play opponent's opening moves first before the player can move.
    return 'OPENING_PHASE';
  };

  const [state, setState] = useState<ChessGameState>({
    phase: getInitialPhase(),
    moveCount: 0,
    consecutiveMisses: 0,
    feedbackMessage: null,
    openingMoveIndex: 0,
    lastValidFen: INITIAL_FEN,
    startingFen: INITIAL_FEN,
  });

  /** Prevents re-entrant processing while async validation is running */
  const processingRef = useRef(false);

  // ─── Engine helpers ───────────────────────────────────────────────────────

  async function fetchEngineMove(): Promise<{ from: Square; to: Square; promotion?: string } | null> {
    const fen = chessRef.current.fen();
    try {
      const topMoves = await getBestMove(fen, engineColor);
      if (topMoves.length === 0) return null;
      const chosen = weightedRandomMove(topMoves);
      const move = chessRef.current.move(chosen.uci);
      if (!move) return null;
      return uciToSquares(chosen.uci);
    } catch {
      return null;
    }
  }

  // ─── Opening phase ────────────────────────────────────────────────────────

  /**
   * Advances through one or more opponent opening moves automatically.
   * Returns the last opponent move that was applied (for animation).
   * Null means opening is complete or no opponent move available.
   */
  function applyNextOpponentOpeningMove(): {
    move: { from: Square; to: Square; promotion?: string };
    nextIndex: number;
    openingComplete: boolean;
  } | null {
    if (!opening) return null;
    const { openingMoveIndex } = state;
    if (openingMoveIndex >= opening.moves.length) return null;

    const san = opening.moves[openingMoveIndex];
    let appliedMove = null;
    try {
      appliedMove = chessRef.current.move(san);
    } catch {
      return null;
    }
    if (!appliedMove) return null;

    const nextIndex = openingMoveIndex + 1;
    const openingComplete = nextIndex >= opening.moves.length;
    const lastValidFen = chessRef.current.fen();

    setState(prev => ({
      ...prev,
      openingMoveIndex: nextIndex,
      phase: openingComplete ? 'ENGINE_TURN' : 'OPENING_PHASE',
      lastValidFen,
      feedbackMessage: openingComplete ? 'Opening complete! Find the best moves.' : null,
    }));

    return {
      move: uciToSquares(
        `${appliedMove.from}${appliedMove.to}${appliedMove.promotion ?? ''}`
      ),
      nextIndex,
      openingComplete,
    };
  }

  function handleOpeningMove(from: Square, to: Square, promotion?: string): PlayerMoveResult {
    if (!opening) return { outcome: 'illegal' };

    const { openingMoveIndex, consecutiveMisses } = state;
    const expectedSan = opening.moves[openingMoveIndex];

    // Try the move on a clone to validate it matches the expected SAN
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
        feedbackMessage: `Wrong! Expected: ${expectedSan}. ${2 - newMisses} chance(s) left.`,
      }));
      return { outcome: 'wrong_move' };
    }

    // Accept the player's move
    chessRef.current.move({ from, to, promotion: promotion as any });
    const newIndex = openingMoveIndex + 1;
    const isComplete = newIndex >= opening.moves.length;
    const lastValidFen = chessRef.current.fen();

    if (isComplete) {
      // Opening done — transition to ENGINE_TURN for free play
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
      feedbackMessage: nextComplete ? 'Opening complete! Now find the best moves.' : null,
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
        feedbackMessage: `Not the best move (${topMove.uci}). One more chance!`,
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
   * Called by the screen after the player drags a piece.
   * Guards: only runs when it's the player's turn at the correct opening index.
   */
  const onPlayerMove = useCallback(
    async (from: Square, to: Square, promotion?: string): Promise<PlayerMoveResult> => {
      if (processingRef.current) return { outcome: 'illegal' };

      if (state.phase === 'OPENING_PHASE') {
        // Extra guard: only allow if it's really the player's turn at this index
        if (!isPlayerTurnAtIndex(state.openingMoveIndex, playerColor)) {
          return { outcome: 'illegal' };
        }
        processingRef.current = true;
        try {
          return handleOpeningMove(from, to, promotion);
        } finally {
          processingRef.current = false;
        }
      }

      if (state.phase === 'GAME_PHASE') {
        processingRef.current = true;
        try {
          return await handleGameMove(from, to, promotion);
        } finally {
          processingRef.current = false;
        }
      }

      return { outcome: 'illegal' };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );

  /**
   * Plays the current opening move for the opponent (used when it's the opponent's turn
   * at the start of Theory Mode with Black, or similar situations).
   */
  const playOpponentOpeningMove = useCallback(() => {
    return applyNextOpponentOpeningMove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.openingMoveIndex, opening]);

  /**
   * Called by the screen to trigger Stockfish's move during free play ENGINE_TURN.
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
    chessRef.current = new Chess();
    setState({
      phase: mode === 'free' ? 'GAME_PHASE' : 'OPENING_PHASE',
      moveCount: 0,
      consecutiveMisses: 0,
      feedbackMessage: null,
      openingMoveIndex: 0,
      lastValidFen: INITIAL_FEN,
      startingFen: INITIAL_FEN,
    });
  }, [opening, mode]);

  /** True when the opponent needs to play an opening move before the player can interact */
  const isOpponentOpeningTurn =
    mode === 'theory' &&
    state.phase === 'OPENING_PHASE' &&
    !!opening &&
    !isPlayerTurnAtIndex(state.openingMoveIndex, playerColor);

  return {
    state,
    onPlayerMove,
    requestEngineMove,
    resetGame,
    playOpponentOpeningMove,
    isOpponentOpeningTurn,
  };
}
