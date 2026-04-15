import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function GameOverScreen() {
  const router = useRouter();
  const { score } = useLocalSearchParams<{ score: string }>();
  const [navigating, setNavigating] = useState(false);
  const moves = parseInt(score ?? '0', 10);

  function getRating(): { label: string; color: string } {
    if (moves >= 30) return { label: 'Grandmaster', color: '#ffd700' };
    if (moves >= 20) return { label: 'Expert', color: '#c0c0c0' };
    if (moves >= 10) return { label: 'Intermediate', color: '#cd7f32' };
    if (moves >= 5)  return { label: 'Beginner', color: '#4caf50' };
    return { label: 'Keep Practicing', color: '#8892a4' };
  }

  const rating = getRating();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Game Over</Text>

        <View style={styles.scoreContainer}>
          <Text style={styles.scoreLabel}>Your Score</Text>
          <Text style={styles.scoreValue}>{moves}</Text>
          <Text style={styles.scoreUnit}>correct moves</Text>
        </View>

        <View style={[styles.ratingBadge, { borderColor: rating.color }]}>
          <Text style={[styles.ratingText, { color: rating.color }]}>
            {rating.label}
          </Text>
        </View>

        <Text style={styles.description}>
          {moves === 0
            ? 'You missed twice on the first move. Study the opening first!'
            : `You played ${moves} best moves in a row before missing twice.`}
        </Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.primaryButton, navigating && styles.primaryButtonDisabled]}
          disabled={navigating}
          onPress={() => { setNavigating(true); router.back(); }}
        >
          {navigating
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.primaryButtonText}>Try Again</Text>
          }
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
    color: '#e94560',
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
  scoreUnit: {
    color: '#8892a4',
    fontSize: 14,
  },
  ratingBadge: {
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '800',
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
  primaryButtonDisabled: {
    opacity: 0.7,
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
