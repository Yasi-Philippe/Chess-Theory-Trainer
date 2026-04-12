import React from 'react';
import { View, StyleSheet } from 'react-native';

interface MissIndicatorProps {
  consecutiveMisses: number;
  max?: number;
}

/**
 * Shows filled/empty hearts (or circles) representing remaining chances.
 * Default max is 2 (miss twice = game over).
 */
export function MissIndicator({ consecutiveMisses, max = 2 }: MissIndicatorProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: max }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < consecutiveMisses ? styles.dotUsed : styles.dotAvailable,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  dotAvailable: {
    backgroundColor: '#4caf50',
  },
  dotUsed: {
    backgroundColor: '#f44336',
  },
});
