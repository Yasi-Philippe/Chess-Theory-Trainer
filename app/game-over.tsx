import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useGameStore } from '../src/store/gameStore';
import { recordGame } from '../src/db/stats';

type GameOverReason = 'two_misses' | 'checkmate' | 'draw' | 'data_error';

function getContent(moves: number, reason: GameOverReason): {
  title: string;
  titleColor: string;
  description: string;
} {
  switch (reason) {
    case 'checkmate':
      return {
        title: 'Checkmate',
        titleColor: '#22c55e',
        description: `The game ended in checkmate after ${moves} correct move${moves !== 1 ? 's' : ''}. Well played!`,
      };
    case 'draw':
      return {
        title: 'Draw',
        titleColor: '#8892a4',
        description: `The game ended in a draw after ${moves} correct move${moves !== 1 ? 's' : ''}.`,
      };
    case 'data_error':
      return {
        title: 'Opening Error',
        titleColor: '#ff9800',
        description: 'This opening contains an invalid move in its theory line. Please report it.',
      };
    default:
      return {
        title: 'Game Over',
        titleColor: '#e94560',
        description: moves === 0
          ? 'You missed twice on the first move. Study the opening first!'
          : `You played ${moves} correct move${moves !== 1 ? 's' : ''} before missing twice in the same position.`,
      };
  }
}

export default function GameOverScreen() {
  const router = useRouter();
  const { score, reason, openingId } = useLocalSearchParams<{ score: string; reason: string; openingId?: string }>();
  const clearSetup = useGameStore(s => s.clearSetup);
  const [isNewBest, setIsNewBest] = useState(false);

  const moves = parseInt(score ?? '0', 10);
  const gameOverReason = (reason as GameOverReason) ?? 'two_misses';
  const { title, titleColor, description } = getContent(moves, gameOverReason);

  useEffect(() => {
    clearSetup();
    // Record stats for Theory Mode games (Free Mode has no opening ID)
    if (openingId) {
      recordGame(openingId, moves).then(updated => {
        setIsNewBest(moves > 0 && updated.best_score === moves && updated.total_games > 1);
      }).catch(() => { /* stats are non-critical */ });
    }
  }, [clearSetup, openingId, moves]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>

        <View style={styles.scoreContainer}>
          <Text style={styles.scoreLabel}>Correct moves</Text>
          <Text style={styles.scoreValue}>{moves}</Text>
          {isNewBest && (
            <Text style={styles.newBest}>New best!</Text>
          )}
        </View>

        <Text style={styles.description}>{description}</Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace('/setup')}
        >
          <Text style={styles.secondaryButtonText}>Change Opening</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.secondaryButtonText}>Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
  },
  scoreContainer: {
    alignItems: 'center',
    gap: 4,
  },
  scoreLabel: {
    color: '#8892a4',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scoreValue: {
    fontSize: 72,
    fontWeight: '900',
    color: '#e0e0e0',
    lineHeight: 80,
  },
  newBest: {
    color: '#22c55e',
    fontWeight: '800',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  description: {
    color: '#8892a4',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  buttons: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#e94560',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#8892a4',
    fontSize: 15,
    fontWeight: '600',
  },
});
