import type { Square } from './types';

export function squareToXY(
  square: Square,
  squareSize: number,
  flipped: boolean,
): { x: number; y: number } {
  'worklet';
  const file = square.charCodeAt(0) - 97; // 'a'=0 … 'h'=7
  const rank = parseInt(square[1], 10) - 1; // '1'=0 … '8'=7
  const x = flipped ? (7 - file) * squareSize : file * squareSize;
  const y = flipped ? rank * squareSize : (7 - rank) * squareSize;
  return { x, y };
}

export function xyToSquare(
  x: number,
  y: number,
  squareSize: number,
  flipped: boolean,
): Square | null {
  'worklet';
  const fileIdx = Math.floor(x / squareSize);
  const rankIdx = Math.floor(y / squareSize);
  if (fileIdx < 0 || fileIdx > 7 || rankIdx < 0 || rankIdx > 7) return null;
  const file = flipped ? 7 - fileIdx : fileIdx;
  const rank = flipped ? rankIdx : 7 - rankIdx;
  return `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
}
