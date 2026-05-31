import React, {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { BoardBackground } from './BoardBackground';
import { HighlightLayer } from './HighlightLayer';
import type { HighlightLayerRef } from './HighlightLayer';
import { SuggestionDots } from './SuggestionDots';
import { Pieces } from './Pieces';
import type { PiecesRef } from './Pieces';
import { PromotionDialog } from './PromotionDialog';
import { BoardContext } from './BoardContext';
import { useBoardLogic } from './useBoardLogic';
import { useHaptics } from '../../hooks/useHaptics';
import type { Square, Color, MoveData, HighlightEntry, BoardRef, BoardProps, PieceSymbol } from './types';

const ChessBoardComponent = forwardRef<BoardRef, BoardProps>(function ChessBoardComponent(
  {
    boardSize,
    fen,
    flipped = false,
    playerColor = 'w',
    colors,
    withLetters = false,
    withNumbers = false,
    onMove,
    onPremove,
    isPlayerTurn = true,
  },
  ref,
) {
  const squareSize = boardSize / 8;

  const boardLogic = useBoardLogic(fen);
  const { trigger: haptic } = useHaptics();
  const piecesRef = useRef<PiecesRef>(null);
  const highlightRef = useRef<HighlightLayerRef>(null);

  // Shared values — update on UI thread without React re-renders
  const turnSV = useSharedValue<Color>(boardLogic.turn);
  const isAnimatingSV = useSharedValue(false);

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [selectableSquares, setSelectableSquares] = useState<Square[]>([]);
  const [premoveFrom, setPremoveFrom] = useState<Square | null>(null);
  const [premoveTo, setPremoveTo] = useState<Square | null>(null);

  // Promotion state
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setSelectableSquares([]);
  }, []);

  const clearPremove = useCallback(() => {
    setPremoveFrom(null);
    setPremoveTo(null);
  }, []);

  // ─── Execute a player move (already validated) ─────────────────────────────
  const commitMove = useCallback(
    async (from: Square, to: Square, promotion?: string) => {
      isAnimatingSV.value = true;

      // Castling is only possible when the king moves from an e-file square.
      const castling = from[0] === 'e' ? detectCastling(boardLogic, from, to) : null;
      // Await both king and rook animations together so the state update
      // (which re-renders Pieces and resets piece.square) only fires after
      // both animations are fully complete, preventing a mid-animation snap.
      await Promise.all([
        piecesRef.current?.animatePiece({ from, to }),
        castling ? piecesRef.current?.animatePiece({ from: castling.rookFrom, to: castling.rookTo }) : Promise.resolve(),
      ]);

      const result = boardLogic.executeMove({ from, to, promotion });
      if (!result.success) {
        piecesRef.current?.snapBack(from);
        isAnimatingSV.value = false;
        return false;
      }

      turnSV.value = boardLogic.turn;
      isAnimatingSV.value = false;
      clearSelection();

      // Haptics
      if (boardLogic.inCheck) {
        haptic(boardLogic.pieces.length <= 2 ? 'checkmate' : 'check');
      } else if (result.captured) {
        haptic('capture');
      } else {
        haptic('move');
      }

      // Flash: green on player's moved-to square
      highlightRef.current?.highlight(to, '#22c55e66');
      setTimeout(() => highlightRef.current?.reset(to), 350);

      onMove?.({ from, to, promotion });
      return true;
    },
    [boardLogic, clearSelection, onMove, turnSV, isAnimatingSV, haptic],
  );

  // ─── Check for promotion ───────────────────────────────────────────────────
  const maybePromote = useCallback(
    (from: Square, to: Square) => {
      const piece = boardLogic.pieces.find(p => p.square === from);
      if (piece?.type === 'p') {
        const targetRank = parseInt(to[1], 10);
        const isPromoRank = piece.color === 'w' ? targetRank === 8 : targetRank === 1;
        if (isPromoRank) {
          setPromotionPending({ from, to });
          return true;
        }
      }
      return false;
    },
    [boardLogic.pieces],
  );

  // ─── Player tap on their own piece ────────────────────────────────────────
  const handlePieceTap = useCallback(
    (square: Square) => {
      if (square === selectedSquare) {
        clearSelection();
        return;
      }
      // Tap on a valid destination square that happens to have a piece (capture via tap)
      if (selectedSquare && selectableSquares.includes(square)) {
        clearSelection();
        if (!maybePromote(selectedSquare, square)) {
          commitMove(selectedSquare, square);
        }
        return;
      }
      // Select the tapped piece
      const moves = boardLogic.getValidMoves(square);
      setSelectedSquare(square);
      setSelectableSquares(moves);
    },
    [selectedSquare, selectableSquares, boardLogic, clearSelection, commitMove, maybePromote],
  );

  // ─── Player dot tap (move selected piece to this square) ──────────────────
  const handleDotTap = useCallback(
    (square: Square) => {
      if (!selectedSquare) return;
      const from = selectedSquare;
      clearSelection();
      if (!maybePromote(from, square)) {
        commitMove(from, square);
      }
    },
    [selectedSquare, clearSelection, commitMove, maybePromote],
  );

  // ─── Player drag drop ─────────────────────────────────────────────────────
  const handleDrop = useCallback(
    (from: Square, to: Square) => {
      // Allow castling by dragging the king onto the rook's square.
      let effectiveTo = to;
      const movingPiece = boardLogic.pieces.find(p => p.square === from);
      if (movingPiece?.type === 'k' && from[0] === 'e') {
        const rank = from[1];
        if (to === (`h${rank}` as Square)) effectiveTo = `g${rank}` as Square;
        else if (to === (`a${rank}` as Square)) effectiveTo = `c${rank}` as Square;
      }

      const validMoves = boardLogic.getValidMoves(from);
      if (!validMoves.includes(effectiveTo)) {
        piecesRef.current?.snapBack(from);
        return;
      }
      clearSelection();
      if (!maybePromote(from, effectiveTo)) {
        commitMove(from, effectiveTo);
      }
    },
    [boardLogic, clearSelection, commitMove, maybePromote],
  );

  // ─── Premove tap ──────────────────────────────────────────────────────────
  const handlePremoveTap = useCallback(
    (square: Square) => {
      if (premoveFrom === square) {
        clearPremove();
        return;
      }
      if (premoveFrom && square !== premoveFrom) {
        // Second tap — set the premove target
        setPremoveTo(square);
        onPremove?.(premoveFrom, square);
        return;
      }
      setPremoveFrom(square);
      setPremoveTo(null);
    },
    [premoveFrom, clearPremove, onPremove],
  );

  // ─── Premove drag ─────────────────────────────────────────────────────────
  const handlePremoveDrop = useCallback(
    (from: Square, to: Square) => {
      setPremoveFrom(from);
      setPremoveTo(to);
      onPremove?.(from, to);
    },
    [onPremove],
  );

  // ─── Promotion dialog confirm ──────────────────────────────────────────────
  const handlePromotionSelect = useCallback(
    (piece: PieceSymbol) => {
      if (!promotionPending) return;
      const { from, to } = promotionPending;
      setPromotionPending(null);
      commitMove(from, to, piece);
    },
    [promotionPending, commitMove],
  );

  // ─── BoardRef imperative API ───────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    move: async ({ from, to, promotion }: MoveData) => {
      isAnimatingSV.value = true;

      const castling = from[0] === 'e' ? detectCastling(boardLogic, from, to) : null;
      // Await king and rook together so the state update (re-render) only fires
      // after both animations complete, preventing a mid-animation snap.
      await Promise.all([
        piecesRef.current?.animatePiece({ from, to }),
        castling ? piecesRef.current?.animatePiece({ from: castling.rookFrom, to: castling.rookTo }) : Promise.resolve(),
      ]);

      const result = boardLogic.executeMove({ from, to, promotion: promotion ?? 'q' });
      turnSV.value = boardLogic.turn;
      isAnimatingSV.value = false;

      // Haptics for engine / programmatic moves
      if (boardLogic.inCheck) {
        haptic('check');
      } else if (result.captured) {
        haptic('capture');
      } else {
        haptic('move');
      }
    },

    highlight: ({ square, color }: HighlightEntry) => {
      highlightRef.current?.highlight(square, color);
    },

    resetAllHighlightedSquares: () => {
      highlightRef.current?.resetAll();
    },

    flashSquare: (square: Square, color: string, durationMs = 350) => {
      highlightRef.current?.highlight(square, color);
      setTimeout(() => highlightRef.current?.reset(square), durationMs);
    },

    resetBoard: (newFen?: string) => {
      boardLogic.resetBoard(newFen);
      piecesRef.current?.resetAllTranslates();
      turnSV.value = boardLogic.turn;
      clearSelection();
      clearPremove();
      highlightRef.current?.resetAll();
    },

    clearPremoveSelection: () => {
      clearPremove();
    },

    getState: () => ({
      fen: boardLogic.fen,
      turn: boardLogic.turn,
    }),
  }));

  const contextValue = {
    squareSize,
    boardSize,
    flipped,
    playerColor,
    turnSV,
    isAnimatingSV,
  };

  return (
    <BoardContext.Provider value={contextValue}>
      <View style={[styles.board, { width: boardSize, height: boardSize }]}>
        <BoardBackground
          boardSize={boardSize}
          flipped={flipped}
          colors={colors}
          withLetters={withLetters}
          withNumbers={withNumbers}
        />
        <HighlightLayer
          ref={highlightRef}
          lastMove={boardLogic.lastMove}
          checkedKingSquare={boardLogic.checkedKingSquare}
          selectedSquare={selectedSquare}
          premoveFrom={premoveFrom}
          premoveTo={premoveTo}
        />
        <SuggestionDots
          squares={selectableSquares}
          pieces={boardLogic.pieces}
          onPress={handleDotTap}
        />
        <Pieces
          ref={piecesRef}
          pieces={boardLogic.pieces}
          onTap={handlePieceTap}
          onDrop={handleDrop}
          onPremoveTap={handlePremoveTap}
          onPremoveDrop={handlePremoveDrop}
        />
      </View>
      <PromotionDialog
        visible={!!promotionPending}
        color={playerColor}
        onSelect={handlePromotionSelect}
      />
    </BoardContext.Provider>
  );
});

// ─── Castling detection ───────────────────────────────────────────────────────
function detectCastling(
  boardLogic: ReturnType<typeof useBoardLogic>,
  from: Square,
  to: Square,
): { rookFrom: Square; rookTo: Square } | null {
  const piece = boardLogic.pieces.find(p => p.square === from);
  if (piece?.type !== 'k') return null;
  const file = from[0];
  const rank = from[1];
  if (file !== 'e') return null;

  // King-side
  if (to === (`g${rank}` as Square)) {
    return {
      rookFrom: `h${rank}` as Square,
      rookTo: `f${rank}` as Square,
    };
  }
  // Queen-side
  if (to === (`c${rank}` as Square)) {
    return {
      rookFrom: `a${rank}` as Square,
      rookTo: `d${rank}` as Square,
    };
  }
  return null;
}

export const ChessBoard = memo(ChessBoardComponent);
export type { BoardRef, BoardProps };

const styles = StyleSheet.create({
  board: {
    position: 'relative',
    overflow: 'visible',
  },
});
