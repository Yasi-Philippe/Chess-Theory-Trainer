import { useState, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Opening, OpeningMode, PlayerColor, GamePhase, StockfishMove, WDL } from '../types';
import { weightedRandomMove } from './useStockfish';

function winProb(wdl: WDL): number {
  const total = wdl.win + wdl.draw + wdl.loss;
  return total === 0 ? 0 : wdl.win / total;
}

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
  lastValidFen: string;
  startingFen: string;
}

const INITIAL_FEN = new Chess().fen();

function isPlayerTurnAtIndex(index: number, playerColor: PlayerColor): boolean {
  const whiteToMove = index % 2 === 0;
  return playerColor === 'white' ? whiteToMove : !whiteToMove;
}

function uciToSquares(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

/** Compute acceptable top-3 moves from a full top-10 list */
function computeAcceptable(top10: StockfishMove[]): StockfishMove[] {
  const top3 = top10.slice(0, 3);
  if (top3.length === 0) return [];
  const positionIsWinning = winProb(top3[0].wdl) > 0.5;
  return positionIsWinning ? top3.filter(m => winProb(m.wdl) >= 0.5) : top3;
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
    if (mode === 'free') {
      return playerColor === 'black' ? 'ENGINE_TURN' : 'GAME_PHASE';
    }
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

  const processingRef = useRef(false);

  // ─── Prefetch cache ───────────────────────────────────────────────────────
  // After the engine moves, we immediately start computing in the background:
  //   1. The player's top-3 acceptable moves (so validation is instant)
  //   2. The engine's reply to each of those moves (so engine reply is instant)
  const prefetchRef = useRef<{
    forFen: string;
    playerMoves: StockfishMove[];
    engineReplies: Map<string, { from: Square; to: Square; promotion?: string } | null>;
  } | null>(null);
  const prefetchActiveRef = useRef(false);

  // Consumed by fetchEngineMove when the engine reply was pre-computed
  const precomputedEngineMoveRef = useRef<{
    from: Square;
    to: Square;
    promotion?: string;
  } | null>(null);

  // ─── Background prefetch ──────────────────────────────────────────────────

  async function startPrefetch(fen: string) {
    prefetchActiveRef.current = true;
    prefetchRef.current = null;
    precomputedEngineMoveRef.current = null;

    try {
      // Step 1: compute the player's top-3 acceptable moves for this position
      const top10 = await getBestMove(fen, playerColor);
      if (!prefetchActiveRef.current) return;

      const acceptable = computeAcceptable(top10);
      const engineReplies = new Map<string, { from: Square; to: Square; promotion?: string } | null>();
      prefetchRef.current = { forFen: fen, playerMoves: acceptable, engineReplies };

      // Step 2: for each acceptable player move, pre-compute the engine reply
      for (const pm of acceptable) {
        if (!prefetchActiveRef.current) return;

        const clone = new Chess(fen);
        let cloneMove;
        try { cloneMove = clone.move(pm.uci); } catch { engineReplies.set(pm.uci, null); continue; }
        if (!cloneMove || clone.isGameOver()) { engineReplies.set(pm.uci, null); continue; }

        try {
          const replies = await getBestMove(clone.fen(), engineColor);
          if (!prefetchActiveRef.current) return;
          if (replies.length === 0) { engineReplies.set(pm.uci, null); continue; }
          const chosen = weightedRandomMove(replies);
          engineReplies.set(pm.uci, uciToSquares(chosen.uci));
        } catch {
          engineReplies.set(pm.uci, null);
        }
      }
    } catch {
      // Prefetch cancelled or failed — live analysis will be used as fallback
    }

    prefetchActiveRef.current = false;
  }

  // ─── Engine helpers ───────────────────────────────────────────────────────

  async function fetchEngineMove(): Promise<{ from: Square; to: Square; promotion?: string } | null> {
    // Use pre-computed reply if available (set by handleGameMove after player's move)
    const precomputed = precomputedEngineMoveRef.current;
    precomputedEngineMoveRef.current = null;

    if (precomputed) {
      try {
        const move = chessRef.current.move({
          from: precomputed.from,
          to: precomputed.to,
          promotion: precomputed.promotion,
        });
        if (move) return precomputed;
      } catch {
        // Pre-computed move turned out to be invalid; fall through to live analysis
      }
    }

    // Live fallback
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
          feedbackMessage: `Game over! The correct move was ${expectedSan}.`,
        }));
        return { outcome: 'wrong_move', gameOver: true, gameOverReason: 'two_misses' };
      }
      setState(prev => ({
        ...prev,
        consecutiveMisses: newMisses,
        feedbackMessage: 'Wrong move! One more chance.',
      }));
      return { outcome: 'wrong_move' };
    }

    chessRef.current.move({ from, to, promotion: promotion as any });
    const newIndex = openingMoveIndex + 1;
    const isComplete = newIndex >= opening.moves.length;
    const lastValidFen = chessRef.current.fen();

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

    // Signal any running prefetch to stop — the player has moved
    prefetchActiveRef.current = false;

    // Use pre-computed acceptable moves if the cache matches this position,
    // otherwise fall back to a live Stockfish query.
    let acceptableMoves: StockfishMove[];
    const cache = prefetchRef.current;

    if (cache && cache.forFen === fen && cache.playerMoves.length > 0) {
      acceptableMoves = cache.playerMoves;
    } else {
      try {
        const top10 = await getBestMove(fen, playerColor);
        acceptableMoves = computeAcceptable(top10);
      } catch {
        return { outcome: 'illegal' };
      }
    }

    if (acceptableMoves.length === 0) return { outcome: 'illegal' };

    const playedUci = `${from}${to}${promotion ?? ''}`;
    const rankIndex = acceptableMoves.findIndex(m => m.uci === playedUci);
    const isAccepted = rankIndex !== -1;

    if (!isAccepted) {
      const newMisses = state.consecutiveMisses + 1;
      if (newMisses >= 2) {
        setState(prev => ({
          ...prev,
          consecutiveMisses: newMisses,
          phase: 'GAME_OVER',
          feedbackMessage: `Game over! Best move was ${acceptableMoves[0].uci}.`,
        }));
        return { outcome: 'wrong_move', gameOver: true, gameOverReason: 'two_misses' };
      }
      setState(prev => ({
        ...prev,
        consecutiveMisses: newMisses,
        feedbackMessage: 'Not the best move. One more chance!',
      }));
      return { outcome: 'wrong_move' };
    }

    // If we have a pre-computed engine reply for the move just played, queue it
    if (cache && cache.forFen === fen && cache.engineReplies.has(playedUci)) {
      precomputedEngineMoveRef.current = cache.engineReplies.get(playedUci) ?? null;
    }

    chessRef.current.move({ from, to, promotion: promotion as any });
    const lastValidFen = chessRef.current.fen();

    const rankLabels = ['Best move!', '2nd best move!', '3rd best move!'];
    const rankLabel = rankLabels[rankIndex] ?? 'Good move!';

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
      feedbackMessage: rankLabel,
      lastValidFen,
    }));

    return { outcome: 'accepted' };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  const onPlayerMove = useCallback(
    async (from: Square, to: Square, promotion?: string): Promise<PlayerMoveResult> => {
      if (processingRef.current) return { outcome: 'illegal' };

      if (state.phase === 'OPENING_PHASE') {
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

  const playOpponentOpeningMove = useCallback(() => {
    return applyNextOpponentOpeningMove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.openingMoveIndex, opening]);

  const requestEngineMove = useCallback(async (): Promise<{
    from: Square;
    to: Square;
    promotion?: string;
  } | null> => {
    const engineMove = await fetchEngineMove();
    if (engineMove) {
      const newFen = chessRef.current.fen();
      const isOver = chessRef.current.isGameOver();
      setState(prev => ({
        ...prev,
        phase: isOver ? 'GAME_OVER' : 'GAME_PHASE',
        moveCount: prev.moveCount + 1,
        lastValidFen: newFen,
        feedbackMessage: null,
      }));

      // Immediately start pre-computing the player's next turn in the background
      if (!isOver) {
        startPrefetch(newFen);
      }
    }
    return engineMove;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getBestMove]);

  const resetGame = useCallback(() => {
    chessRef.current = new Chess();
    prefetchRef.current = null;
    prefetchActiveRef.current = false;
    precomputedEngineMoveRef.current = null;
    setState({
      phase: mode === 'free'
        ? (playerColor === 'black' ? 'ENGINE_TURN' : 'GAME_PHASE')
        : 'OPENING_PHASE',
      moveCount: 0,
      consecutiveMisses: 0,
      feedbackMessage: null,
      openingMoveIndex: 0,
      lastValidFen: INITIAL_FEN,
      startingFen: INITIAL_FEN,
    });
  }, [opening, mode]);

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
