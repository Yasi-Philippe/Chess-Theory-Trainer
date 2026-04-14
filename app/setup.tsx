import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { OpeningSelector } from '../src/components/OpeningSelector/OpeningSelector';
import { Opening, PlayerColor, OpeningMode } from '../src/types';
import { useGameStore } from '../src/store/gameStore';

export default function SetupScreen() {
  const router = useRouter();
  const setSetup = useGameStore(state => state.setSetup);
  const [navigating, setNavigating] = useState(false);

  useFocusEffect(useCallback(() => { setNavigating(false); }, []));

  function handleSelect(opening: Opening | null, color: PlayerColor, mode: OpeningMode) {
    setNavigating(true);
    setSetup({ opening, color, mode });
    // Defer navigation by one frame so React can paint the spinner first.
    requestAnimationFrame(() => router.push('/game'));
  }

  return (
    <View style={styles.container}>
      <OpeningSelector onSelect={handleSelect} navigating={navigating} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
});
