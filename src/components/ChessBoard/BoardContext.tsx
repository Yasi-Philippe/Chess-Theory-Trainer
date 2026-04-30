import React, { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { Color } from './types';

export type BoardContextValue = {
  squareSize: number;
  boardSize: number;
  flipped: boolean;
  playerColor: Color;
  turnSV: SharedValue<Color>;
  isAnimatingSV: SharedValue<boolean>;
};

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoardContext must be used inside BoardContext.Provider');
  return ctx;
}
