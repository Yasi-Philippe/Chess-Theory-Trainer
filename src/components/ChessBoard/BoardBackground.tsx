import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FILES, RANKS, DEFAULT_COLORS } from './constants';
import type { BoardColors } from './types';

type Props = {
  boardSize: number;
  flipped?: boolean;
  colors?: BoardColors;
  withLetters?: boolean;
  withNumbers?: boolean;
};

export const BoardBackground = memo(function BoardBackground({
  boardSize,
  flipped = false,
  colors = DEFAULT_COLORS,
  withLetters = true,
  withNumbers = true,
}: Props) {
  const squareSize = boardSize / 8;
  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  return (
    <View style={[styles.board, { width: boardSize, height: boardSize }]}>
      {ranks.map((rank, rankIdx) =>
        files.map((file, fileIdx) => {
          const isLight = (rankIdx + fileIdx) % 2 === 0;
          const bg = isLight ? colors.light : colors.dark;
          const isLastFile = fileIdx === 7;
          const isLastRank = rankIdx === 7;
          const labelColor = isLight ? colors.dark : colors.light;
          return (
            <View
              key={`${file}${rank}`}
              style={[styles.square, { width: squareSize, height: squareSize, backgroundColor: bg }]}
            >
              {withNumbers && fileIdx === 0 && (
                <Text style={[styles.rankLabel, { color: labelColor, fontSize: squareSize * 0.22 }]}>
                  {rank}
                </Text>
              )}
              {withLetters && isLastRank && (
                <Text style={[styles.fileLabel, { color: labelColor, fontSize: squareSize * 0.22 }]}>
                  {file}
                </Text>
              )}
            </View>
          );
        })
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  square: {
    position: 'relative',
    overflow: 'hidden',
  },
  rankLabel: {
    position: 'absolute',
    top: 2,
    left: 3,
    fontWeight: '700',
  },
  fileLabel: {
    position: 'absolute',
    bottom: 2,
    right: 3,
    fontWeight: '700',
  },
});
