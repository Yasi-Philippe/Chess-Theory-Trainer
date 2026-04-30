import { useState, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import type { Square, Color, MoveData, BoardPiece } from './types';

export type BoardLogic = {
  fen: string;
  turn: Color;
  pieces: BoardPiece[];
  lastMove: { from: Square; to: Square } | null;
  inCheck: boolean;
  checkedKingSquare: Square | null;
  getValidMoves: (square: Square) => Square[];
  executeMove: (move: MoveData) => { success: boolean; captured: boolean };
  resetBoard: (fen?: string) => void;
};

const fenToPieces = (chess: Chess): BoardPiece[] => {
  const result: BoardPiece[] = [];
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (cell) {
        result.push({ type: cell.type, color: cell.color, square: cell.square });
      }
    }
  }
  return result;
};

const findKingSquare = (chess: Chess, color: Color): Square | null => {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (cell && cell.type === 'k' && cell.color === color) {
        return cell.square;
      }
    }
  }
  return null;
};

export function useBoardLogic(initialFen?: string): BoardLogic {
  const chessRef = useRef(new Chess(initialFen));
  const chess = chessRef.current;

  const [fen, setFen] = useState(chess.fen());
  const [pieces, setPieces] = useState<BoardPiece[]>(() => fenToPieces(chess));
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);

  const syncState = useCallback(() => {
    setFen(chess.fen());
    setPieces(fenToPieces(chess));
  }, [chess]);

  const getValidMoves = useCallback((square: Square): Square[] => {
    const moves = chess.moves({ square, verbose: true }) as any[];
    return moves.map((m: any) => m.to as Square);
  }, [chess]);

  const executeMove = useCallback((move: MoveData): { success: boolean; captured: boolean } => {
    try {
      const result = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
      if (!result) return { success: false, captured: false };
      setLastMove({ from: move.from, to: move.to });
      syncState();
      return { success: true, captured: !!result.captured };
    } catch {
      return { success: false, captured: false };
    }
  }, [chess, syncState]);

  const resetBoard = useCallback((newFen?: string) => {
    if (newFen) {
      chess.load(newFen);
    } else {
      chess.reset();
    }
    setLastMove(null);
    syncState();
  }, [chess, syncState]);

  const turn = chess.turn();
  const inCheck = chess.inCheck();
  const checkedKingSquare = inCheck ? findKingSquare(chess, turn) : null;

  return {
    fen,
    turn,
    pieces,
    lastMove,
    inCheck,
    checkedKingSquare,
    getValidMoves,
    executeMove,
    resetBoard,
  };
}
