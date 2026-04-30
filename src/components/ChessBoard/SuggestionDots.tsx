import React, { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { squareToXY } from './boardUtils';
import { useBoardContext } from './BoardContext';
import type { Square, BoardPiece } from './types';

type Props = {
  squares: Square[];
  pieces: BoardPiece[];
  onPress: (square: Square) => void;
};

export const SuggestionDots = memo(function SuggestionDots({
  squares,
  pieces,
  onPress,
}: Props) {
  const { squareSize, flipped } = useBoardContext();

  if (squares.length === 0) return null;

  const occupiedSet = new Set(pieces.map(p => p.square));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {squares.map(square => {
        const { x, y } = squareToXY(square, squareSize, flipped);
        const isCapture = occupiedSet.has(square);
        return (
          <TouchableOpacity
            key={square}
            activeOpacity={0.7}
            onPress={() => onPress(square)}
            style={[styles.cell, { width: squareSize, height: squareSize, left: x, top: y }]}
          >
            {isCapture ? (
              <View style={[styles.captureRing, { width: squareSize, height: squareSize, borderRadius: squareSize / 2, borderWidth: squareSize * 0.09 }]} />
            ) : (
              <View style={[styles.dot, { width: squareSize * 0.3, height: squareSize * 0.3, borderRadius: squareSize * 0.15 }]} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  captureRing: {
    borderColor: 'rgba(0,0,0,0.22)',
    backgroundColor: 'transparent',
  },
});
