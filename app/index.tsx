import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      <View style={styles.hero}>
        <Text style={styles.title}>Chess Theory{'\n'}Trainer</Text>
        <Text style={styles.subtitle}>
          Master openings by always finding{'\n'}the best move
        </Text>
      </View>

      <View style={styles.features}>
        <FeatureRow icon="♟" text="20+ openings for White & Black" />
        <FeatureRow icon="⚡" text="Powered by Stockfish engine" />
        <FeatureRow icon="🎯" text="Play from position or through theory" />
        <FeatureRow icon="📈" text="Score by consecutive correct moves" />
      </View>

      <TouchableOpacity
        style={styles.startButton}
        onPress={() => router.push('/setup')}
      >
        <Text style={styles.startButtonText}>Start Training</Text>
      </TouchableOpacity>
    </View>
  );
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  hero: {
    alignItems: 'center',
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    color: '#e94560',
    textAlign: 'center',
    lineHeight: 50,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#8892a4',
    textAlign: 'center',
    lineHeight: 24,
  },
  features: {
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 14,
  },
  featureIcon: {
    fontSize: 24,
  },
  featureText: {
    color: '#e0e0e0',
    fontSize: 15,
    fontWeight: '500',
  },
  startButton: {
    backgroundColor: '#e94560',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
