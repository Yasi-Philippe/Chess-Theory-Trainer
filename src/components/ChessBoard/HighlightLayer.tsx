import React, {
  forwardRef,
  memo,
  useImperativeHandle,
  useState,
  useCallback,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { squareToXY } from './boardUtils';
import { useBoardContext } from './BoardContext';
import type { Square } from './types';

export type HighlightLayerRef = {
  highlight: (square: Square, color: string) => void;
  resetAll: () => void;
  reset: (square: Square) => void;
};

type Props = {
  lastMove: { from: Square; to: Square } | null;
  checkedKingSquare: Square | null;
  selectedSquare: Square | null;
  premoveFrom: Square | null;
  premoveTo: Square | null;
};

const LAST_MOVE_LIGHT = '#cdd26a88';
const LAST_MOVE_DARK  = '#aaa23aaa';
const CHECK_COLOR     = '#ff000099';
const SELECTED_COLOR  = '#20e07066';
const PREMOVE_COLOR   = '#f6a82566';

export const HighlightLayer = memo(
  forwardRef<HighlightLayerRef, Props>(function HighlightLayer(
    { lastMove, checkedKingSquare, selectedSquare, premoveFrom, premoveTo },
    ref,
  ) {
    const { squareSize, flipped } = useBoardContext();
    const [externals, setExternals] = useState<Record<string, string>>({});

    useImperativeHandle(ref, () => ({
      highlight: (square, color) =>
        setExternals(prev => ({ ...prev, [square]: color })),
      reset: (square) =>
        setExternals(prev => {
          const next = { ...prev };
          delete next[square];
          return next;
        }),
      resetAll: () => setExternals({}),
    }));

    const entries: { square: Square; color: string }[] = [];

    const addIf = (sq: Square | null, color: string) => {
      if (sq) entries.push({ square: sq, color });
    };

    if (lastMove) {
      const isLightFrom = isLightSquare(lastMove.from);
      addIf(lastMove.from, isLightFrom ? LAST_MOVE_LIGHT : LAST_MOVE_DARK);
      const isLightTo = isLightSquare(lastMove.to);
      addIf(lastMove.to, isLightTo ? LAST_MOVE_LIGHT : LAST_MOVE_DARK);
    }
    addIf(checkedKingSquare, CHECK_COLOR);
    addIf(selectedSquare, SELECTED_COLOR);
    addIf(premoveFrom, PREMOVE_COLOR);
    addIf(premoveTo, PREMOVE_COLOR);
    for (const [sq, color] of Object.entries(externals)) {
      entries.push({ square: sq as Square, color });
    }

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {entries.map(({ square, color }) => {
          const { x, y } = squareToXY(square, squareSize, flipped);
          return (
            <View
              key={square + color}
              style={[
                styles.cell,
                { width: squareSize, height: squareSize, left: x, top: y, backgroundColor: color },
              ]}
            />
          );
        })}
      </View>
    );
  }),
);

function isLightSquare(square: Square): boolean {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  return (file + rank) % 2 !== 0;
}

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
  },
});
