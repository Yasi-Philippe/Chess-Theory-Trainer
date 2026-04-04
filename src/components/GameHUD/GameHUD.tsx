import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GameState } from '../../types';

interface GameHUDProps {
  gameState: GameState;
  feedbackMessage: string | null;
}

export function GameHUD({ gameState, feedbackMessage }: GameHUDProps) {
  const { moveCount, consecutiveMisses, phase, opening } = gameState;

  const phaseLabel =
    phase === 'OPENING_PHASE'
      ? 'Opening Phase'
      : phase === 'ENGINE_TURN'
      ? 'Engine thinking…'
      : phase === 'GAME_PHASE'
      ? 'Your turn — find the best move!'
      : 'Game Over';

  const feedbackColor =
    feedbackMessage?.startsWith('Best') || feedbackMessage?.startsWith('Opening')
      ? '#4caf50'
      : feedbackMessage?.includes('over') || feedbackMessage?.includes('twice')
      ? '#f44336'
      : '#ff9800';

  return (
    <View style={styles.container}>
      {/* Opening name */}
      <Text style={styles.openingName}>{opening.name}</Text>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{moveCount}</Text>
          <Text style={styles.statLabel}>Moves</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={[styles.statValue, consecutiveMisses > 0 && styles.missValue]}>
            {consecutiveMisses} / {2}
          </Text>
          <Text style={styles.statLabel}>Misses</Text>
        </View>
      </View>

      {/* Phase indicator */}
      <Text style={styles.phase}>{phaseLabel}</Text>

      {/* Feedback message */}
      {feedbackMessage && (
        <View style={[styles.feedback, { borderLeftColor: feedbackColor }]}>
          <Text style={[styles.feedbackText, { color: feedbackColor }]}>
            {feedbackMessage}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    gap: 8,
  },
  openingName: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: '#e94560',
    fontSize: 28,
    fontWeight: '800',
  },
  missValue: {
    color: '#ff9800',
  },
  statLabel: {
    color: '#8892a4',
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#0f3460',
  },
  phase: {
    color: '#8892a4',
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  feedback: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
