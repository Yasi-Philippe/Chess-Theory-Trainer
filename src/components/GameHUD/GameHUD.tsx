import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GameState } from '../../types';

interface GameHUDProps {
  gameState: GameState;
  feedbackMessage: string | null;
}

export function GameHUD({ gameState, feedbackMessage }: GameHUDProps) {
  const { moveCount, consecutiveMisses, phase, opening, openingMode, openingMoveIndex } = gameState;

  let phaseLabel: string;
  if (phase === 'OPENING_PHASE') {
    const total = opening?.moves.length ?? 0;
    phaseLabel = `Opening Theory — move ${openingMoveIndex + 1} / ${total}`;
  } else if (phase === 'ENGINE_TURN') {
    phaseLabel = 'Engine thinking…';
  } else if (phase === 'GAME_PHASE') {
    phaseLabel = 'Your turn — find the best move!';
  } else {
    phaseLabel = 'Game Over';
  }

  const feedbackColor =
    feedbackMessage?.startsWith('Best') || feedbackMessage?.startsWith('Opening')
      ? '#4caf50'
      : feedbackMessage?.includes('over') || feedbackMessage?.includes('twice')
      ? '#f44336'
      : '#ff9800';

  const modeBadge = openingMode === 'free' ? 'FREE' : 'THEORY';
  const modeBadgeColor = openingMode === 'free' ? '#0f3460' : '#1a0a10';
  const modeBadgeBorder = openingMode === 'free' ? '#0f3460' : '#e94560';

  return (
    <View style={styles.container}>
      {/* Opening name + mode badge */}
      <View style={styles.titleRow}>
        <Text style={styles.openingName} numberOfLines={1}>
          {opening?.name ?? 'Free Play'}
        </Text>
        <View style={[styles.modeBadge, { backgroundColor: modeBadgeColor, borderColor: modeBadgeBorder }]}>
          <Text style={[styles.modeBadgeText, { color: modeBadgeBorder }]}>{modeBadge}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{moveCount}</Text>
          <Text style={styles.statLabel}>Score</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={[styles.statValue, consecutiveMisses > 0 && styles.missValue]}>
            {consecutiveMisses} / 2
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
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  openingName: {
    color: '#e0e0e0',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  modeBadge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  modeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
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
    fontSize: 11,
    marginTop: 1,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#0f3460',
  },
  phase: {
    color: '#8892a4',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  feedback: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 4,
    marginTop: 2,
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
