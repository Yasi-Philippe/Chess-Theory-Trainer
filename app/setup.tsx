import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { OpeningSelector } from '../src/components/OpeningSelector/OpeningSelector';
import { Opening, PlayerColor, OpeningMode } from '../src/types';
import { useGameStore } from '../src/store/gameStore';

export default function SetupScreen() {
  const router = useRouter();
  const setSetup = useGameStore(state => state.setSetup);

  function handleSelect(opening: Opening | null, color: PlayerColor, mode: OpeningMode) {
    setSetup({ opening, color, mode });
    router.push('/game');
  }

  return (
    <View style={styles.container}>
      <OpeningSelector onSelect={handleSelect} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
});
