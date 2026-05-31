import { useState, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { MISS_LIMIT } from '../constants';
import type { Square } from 'chess.js';
import { Opening, OpeningMode, PlayerColor, GamePhase, StockfishMove, WDL } from '../types';
import { weightedRandomMove } from './useStockfish';
import { OPENINGS } from '../data/openings';

function winProb(wdl: WDL): number {
  const total = wdl.win + wdl.draw + wdl.loss;
  return total === 0 ? 0 : wdl.win / total;
}

// Normalize FEN to the first 4 fields (position + castling + en-passant + active color),
// dropping the halfmove clock and fullmove number for position-only comparison.
function normalizeFen(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

// Checks whether playedUci is a recognized theory move from the current position.
// Used in Free Mode to accept any principled opening move regardless of engine ranking.
function isTheoryMove(fen: string, playedUci: string): boolean {
  const target = normalizeFen(fen);
  for (const opening of OPENINGS) {
    const chess = new Chess();
    for (let i = 0; i < opening.moves.length; i++) {
      if (normalizeFen(chess.fen()) === target) {
        try {
          const m = new Chess(chess.fen()).move(opening.moves[i]);
          if (m) {
            const uci = `${m.from}${m.to}${m.promotion ?? ''}`;
            if (uci === playedUci) return true;
          }
        } catch { /* invalid move in opening data */ }
      }
      try { chess.move(opening.moves[i]); } catch { break; }
    }
  }
  return false;
}

export interface PlayerMoveResult {
  outcome: 'accepted' | 'wrong_move' | 'illegal';
  engineMove?: { from: Square; to: Square; promotion?: string };
  gameOver?: boolean;
  gameOverReason?: 'two_misses' | 'checkmate' | 'draw' | 'data_error';
  bestMove?: { from: Square; to: Square };
}

interface UseChessGameParams {
  opening: Opening | null;
  playerColor: PlayerColor;
  mode: OpeningMode;
  getBestMove: (fen: string, color: PlayerColor) => Promise<StockfishMove[]>;
  getEligibleSet: (fen: string) => Promise<StockfishMove[]>;
}

export interface ChessGameState {
  phase: GamePhase;
  moveCount: number;
  consecutiveMisses: number;
  feedbackMessage: string | null;
  openingMoveIndex: number;
  lastValidFen: string;
  startingFen: string;
  gameOverReason: 'two_misses' | 'checkmate' | 'draw' | 'data_error' | null;
}

const INITIAL_FEN = new Chess().fen();
const MSG_OPENING_COMPLETE = 'Opening complete! Now find the best moves.';

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

function detectGameOver(chess: Chess): 'checkmate' | 'draw' | null {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isDraw()) return 'draw';
  return null;
}

export function useChessGame({
  opening,
  playerColor,
  mode,
  getBestMove,
  getEligibleSet,
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
    gameOverReason: null,
  });

  const processingRef = useRef(false);

  // ─── Prefetch cache ───────────────────────────────────────────────────────
  // After the engine moves, we immediately compute the eligible set for the
  // player's next position in the background so move validation is instant.
  // The engine's reply is always computed live (under the thinking banner).
  const prefetchRef = useRef<{
    forFen: string;
    eligibleSet: StockfishMove[];
  } | null>(null);
  // Generation counter: incremented on each new prefetch start.
  // The async function aborts its result if a newer prefetch has started.
  const prefetchGenRef = useRef(0);

  // ─── Background prefetch ──────────────────────────────────────────────────

  async function startPrefetch(fen: string) {
    const myGen = ++prefetchGenRef.current;
    prefetchRef.current = null;

    try {
      const eligibleSet = await getEligibleSet(fen);
      if (prefetchGenRef.current !== myGen) return; // superseded
      prefetchRef.current = { forFen: fen, eligibleSet };
    } catch {
      // Prefetch failed — live fallback will be used when the player moves
    }
  }

  // ─── Engine move selection ────────────────────────────────────────────────

  // Returns the UCI of the chosen engine move WITHOUT applying it to chessRef.
  // The caller (requestEngineMove) applies it after confirming the move is valid.
  async function fetchEngineMoveUci(): Promise<string | null> {
    const fen = chessRef.current.fen();
    try {
      const eligible = await getEligibleSet(fen);
      if (eligible.length === 0) return null;
      const chosen = weightedRandomMove(eligible);
      // Validate the move exists in this position before returning
      const clone = new Chess(fen);
      const move = clone.move(chosen.uci);
      return move ? chosen.uci : null;
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
      // Invalid move in opening data — fail safely to avoid permanent freeze
    }

    if (!appliedMove) {
      setState(prev => ({
        ...prev,
        phase: 'GAME_OVER',
        gameOverReason: 'data_error',
        feedbackMessage: 'Opening data error.',
      }));
      return null;
    }

    const nextIndex = openingMoveIndex + 1;
    const openingComplete = nextIndex >= opening.moves.length;
    const lastValidFen = chessRef.current.fen();

    setState(prev => ({
      ...prev,
      openingMoveIndex: nextIndex,
      phase: openingComplete ? 'ENGINE_TURN' : 'OPENING_PHASE',
      lastValidFen,
      feedbackMessage: openingComplete ? MSG_OPENING_COMPLETE : null,
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
      move = clone.move({ from, to, promotion: promotion as 'q' | 'r' | 'b' | 'n' | undefined });
    } catch {
      return { outcome: 'illegal' };
    }

    if (!move || move.san !== expectedSan) {
      const newMisses = consecutiveMisses + 1;
      if (newMisses >= MISS_LIMIT) {
        const bestVerbose = new Chess(chessRef.current.fen())
          .moves({ verbose: true })
          .find((m: any) => m.san === expectedSan);
        const bestMove = bestVerbose
          ? { from: bestVerbose.from as Square, to: bestVerbose.to as Square }
          : undefined;
        setState(prev => ({
          ...prev,
          consecutiveMisses: newMisses,
          phase: 'GAME_OVER',
          gameOverReason: 'two_misses',
          feedbackMessage: 'Game over!',
        }));
        return { outcome: 'wrong_move', gameOver: true, gameOverReason: 'two_misses', bestMove };
      }
      setState(prev => ({
        ...prev,
        consecutiveMisses: newMisses,
        feedbackMessage: 'Wrong move! One more chance.',
      }));
      return { outcome: 'wrong_move' };
    }

    chessRef.current.move({ from, to, promotion: promotion as 'q' | 'r' | 'b' | 'n' | undefined });
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
        feedbackMessage: MSG_OPENING_COMPLETE,
        lastValidFen,
        gameOverReason: null,
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

    if (!opponentMove) {
      // Invalid opponent move in opening data
      setState(prev => ({
        ...prev,
        phase: 'GAME_OVER',
        gameOverReason: 'data_error',
        feedbackMessage: 'Opening data error.',
      }));
      return { outcome: 'accepted', gameOver: true, gameOverReason: 'data_error' };
    }

    const nextIndex = newIndex + 1;
    const nextComplete = nextIndex >= opening.moves.length;
    const newLastValidFen = chessRef.current.fen();

    setState(prev => ({
      ...prev,
      openingMoveIndex: nextIndex,
      consecutiveMisses: 0,
      moveCount: prev.moveCount + 1,
      phase: nextComplete ? 'ENGINE_TURN' : 'OPENING_PHASE',
      feedbackMessage: nextComplete ? MSG_OPENING_COMPLETE : null,
      lastValidFen: newLastValidFen,
      gameOverReason: null,
    }));

    return {
      outcome: 'accepted',
      engineMove: uciToSquares(
        `${opponentMove.from}${opponentMove.to}${opponentMove.promotion ?? ''}`
      ),
    };
  }

  // ─── Game phase ───────────────────────────────────────────────────────────

  async function handleGameMove(from: Square, to: Square, promotion?: string): Promise<PlayerMoveResult> {
    const fen = chessRef.current.fen();

    // Cancel any running prefetch — the player has moved
    prefetchGenRef.current++;

    // Use cached eligible set if the prefetch completed for this exact position,
    // otherwise fall back to a live query.
    let eligibleMoves: StockfishMove[];
    const cache = prefetchRef.current;

    if (cache && cache.forFen === fen && cache.eligibleSet.length > 0) {
      eligibleMoves = cache.eligibleSet;
    } else {
      try {
        eligibleMoves = await getEligibleSet(fen);
      } catch {
        return { outcome: 'illegal' };
      }
    }

    if (eligibleMoves.length === 0) return { outcome: 'illegal' };

    const playedUci = `${from}${to}${promotion ?? ''}`;
    const rankIndex = eligibleMoves.findIndex(m => m.uci === playedUci);
    let isAccepted = rankIndex !== -1;

    // In Free Mode, also accept any recognized opening theory move
    if (!isAccepted && mode === 'free') {
      isAccepted = isTheoryMove(fen, playedUci);
    }

    if (!isAccepted) {
      const newMisses = state.consecutiveMisses + 1;
      if (newMisses >= MISS_LIMIT) {
        const bestUci = eligibleMoves[0].uci;
        const bestMove = {
          from: bestUci.slice(0, 2) as Square,
          to: bestUci.slice(2, 4) as Square,
        };
        setState(prev => ({
          ...prev,
          consecutiveMisses: newMisses,
          phase: 'GAME_OVER',
          gameOverReason: 'two_misses',
          feedbackMessage: 'Game over!',
        }));
        return { outcome: 'wrong_move', gameOver: true, gameOverReason: 'two_misses', bestMove };
      }
      setState(prev => ({
        ...prev,
        consecutiveMisses: newMisses,
        feedbackMessage: 'Not the best move. One more chance!',
      }));
      return { outcome: 'wrong_move' };
    }

    chessRef.current.move({ from, to, promotion: promotion as 'q' | 'r' | 'b' | 'n' | undefined });
    const lastValidFen = chessRef.current.fen();

    const naturalEnd = detectGameOver(chessRef.current);
    if (naturalEnd) {
      setState(prev => ({
        ...prev,
        consecutiveMisses: 0,
        moveCount: prev.moveCount + 1,
        phase: 'GAME_OVER',
        gameOverReason: naturalEnd,
        feedbackMessage: naturalEnd === 'checkmate' ? 'Checkmate!' : 'Draw!',
        lastValidFen,
      }));
      return { outcome: 'accepted', gameOver: true, gameOverReason: naturalEnd };
    }

    const rankLabels = ['Best move!', '2nd best move!', '3rd best move!'];
    const rankLabel = rankIndex >= 0 ? (rankLabels[rankIndex] ?? 'Good move!') : 'Good move!';

    setState(prev => ({
      ...prev,
      consecutiveMisses: 0,
      moveCount: prev.moveCount + 1,
      phase: 'ENGINE_TURN',
      feedbackMessage: rankLabel,
      lastValidFen,
      gameOverReason: null,
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
    // Intentionally depends on full state: miss counter, phase, and openingMoveIndex
    // are all read from the closure and must be fresh at call time.
    [state],
  );

  const playOpponentOpeningMove = useCallback(() => {
    return applyNextOpponentOpeningMove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Depends on openingMoveIndex and opening — both captured correctly here.
  }, [state.openingMoveIndex, opening]);

  const requestEngineMove = useCallback(async (): Promise<{
    from: Square;
    to: Square;
    promotion?: string;
  } | null> => {
    // Fetch the chosen engine move UCI without mutating chessRef yet
    const uci = await fetchEngineMoveUci();
    if (!uci) return null;

    // Apply to chessRef only after the UCI is confirmed valid
    const move = chessRef.current.move(uci);
    if (!move) return null;

    const newFen = chessRef.current.fen();
    const naturalEnd = detectGameOver(chessRef.current);

    setState(prev => ({
      ...prev,
      phase: naturalEnd ? 'GAME_OVER' : 'GAME_PHASE',
      gameOverReason: naturalEnd ?? null,
      moveCount: prev.moveCount + 1,
      lastValidFen: newFen,
      feedbackMessage: naturalEnd === 'checkmate' ? 'Checkmate!' : naturalEnd === 'draw' ? 'Draw!' : null,
    }));

    // Start pre-computing the eligible set for the player's next turn in the background
    if (!naturalEnd) {
      startPrefetch(newFen);
    }

    return uciToSquares(uci);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // getEligibleSet is stable (useCallback with [analyse] dep in useStockfish).
  }, [getEligibleSet]);

  const resetGame = useCallback(() => {
    chessRef.current = new Chess();
    prefetchRef.current = null;
    prefetchGenRef.current = 0;
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
      gameOverReason: null,
    });
  }, [opening, mode]);

  const isOpponentOpeningTurn =
    mode === 'theory' &&
    state.phase === 'OPENING_PHASE' &&
    !!opening &&
    !isPlayerTurnAtIndex(state.openingMoveIndex, playerColor);

  const warmUp = useCallback(
    (fen: string) => { startPrefetch(fen); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // getEligibleSet is stable — only need it as an indirect dep via startPrefetch.
    [getEligibleSet],
  );

  return {
    state,
    onPlayerMove,
    requestEngineMove,
    resetGame,
    playOpponentOpeningMove,
    isOpponentOpeningTurn,
    warmUp,
  };
}
