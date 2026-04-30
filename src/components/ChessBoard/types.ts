import type { Square, PieceSymbol, Color } from 'chess.js';

export type { Square, PieceSymbol, Color };

export type BoardPiece = {
  type: PieceSymbol;
  color: Color;
  square: Square;
};

export type MoveData = {
  from: Square;
  to: Square;
  promotion?: string;
};

export type HighlightEntry = {
  square: Square;
  color: string;
};

export type ArrowEntry = {
  from: Square;
  to: Square;
  color?: string;
};

export type BoardRef = {
  move: (params: MoveData) => Promise<void>;
  highlight: (params: HighlightEntry) => void;
  resetAllHighlightedSquares: () => void;
  flashSquare: (square: Square, color: string, durationMs?: number) => void;
  resetBoard: (fen?: string) => void;
  clearPremoveSelection: () => void;
  getState: () => { fen: string; turn: Color };
};

export type BoardColors = {
  light: string;
  dark: string;
};

export type BoardProps = {
  boardSize: number;
  fen?: string;
  flipped?: boolean;
  playerColor?: Color;
  colors?: BoardColors;
  withLetters?: boolean;
  withNumbers?: boolean;
  onMove?: (params: { from: Square; to: Square; promotion?: string }) => void;
  onPremove?: (from: Square, to: Square) => void;
  isPlayerTurn?: boolean;
};
