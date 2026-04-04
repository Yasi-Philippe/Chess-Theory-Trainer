import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Opening, PlayerColor, OpeningMode } from '../../types';
import { OPENINGS_BY_COLOR } from '../../data/openings';

interface OpeningSelectorProps {
  onSelect: (opening: Opening, color: PlayerColor, mode: OpeningMode) => void;
}

export function OpeningSelector({ onSelect }: OpeningSelectorProps) {
  const [selectedColor, setSelectedColor] = useState<PlayerColor>('white');
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
  const [selectedMode, setSelectedMode] = useState<OpeningMode>('from_position');

  const openings = OPENINGS_BY_COLOR[selectedColor];

  function handleStart() {
    if (!selectedOpening) return;
    onSelect(selectedOpening, selectedColor, selectedMode);
  }

  return (
    <View style={styles.container}>
      {/* ── Color selection ── */}
      <Text style={styles.sectionTitle}>Play as</Text>
      <View style={styles.colorRow}>
        {(['white', 'black'] as PlayerColor[]).map(color => (
          <TouchableOpacity
            key={color}
            style={[
              styles.colorButton,
              selectedColor === color && styles.colorButtonActive,
            ]}
            onPress={() => {
              setSelectedColor(color);
              setSelectedOpening(null);
            }}
          >
            <Text
              style={[
                styles.colorButtonText,
                selectedColor === color && styles.colorButtonTextActive,
              ]}
            >
              {color.charAt(0).toUpperCase() + color.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Mode selection ── */}
      <Text style={styles.sectionTitle}>Training mode</Text>
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[
            styles.modeButton,
            selectedMode === 'from_position' && styles.modeButtonActive,
          ]}
          onPress={() => setSelectedMode('from_position')}
        >
          <Text style={styles.modeTitle}>From Position</Text>
          <Text style={styles.modeDesc}>Start at the end of the opening</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeButton,
            selectedMode === 'play_through' && styles.modeButtonActive,
          ]}
          onPress={() => setSelectedMode('play_through')}
        >
          <Text style={styles.modeTitle}>Play Through</Text>
          <Text style={styles.modeDesc}>Replay the opening moves first</Text>
        </TouchableOpacity>
      </View>

      {/* ── Opening list ── */}
      <Text style={styles.sectionTitle}>Select opening</Text>
      <FlatList
        data={openings}
        keyExtractor={item => item.id}
        style={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.openingItem,
              selectedOpening?.id === item.id && styles.openingItemActive,
            ]}
            onPress={() => setSelectedOpening(item)}
          >
            <View style={styles.openingHeader}>
              <Text style={styles.openingName}>{item.name}</Text>
              <Text style={styles.openingEco}>{item.eco}</Text>
            </View>
            <Text style={styles.openingDesc}>{item.description}</Text>
          </TouchableOpacity>
        )}
      />

      {/* ── Start button ── */}
      <TouchableOpacity
        style={[styles.startButton, !selectedOpening && styles.startButtonDisabled]}
        onPress={handleStart}
        disabled={!selectedOpening}
      >
        <Text style={styles.startButtonText}>Start Training</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 16,
  },
  sectionTitle: {
    color: '#8892a4',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
  },
  colorButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0f3460',
    alignItems: 'center',
  },
  colorButtonActive: {
    backgroundColor: '#e94560',
    borderColor: '#e94560',
  },
  colorButtonText: {
    color: '#8892a4',
    fontWeight: '600',
  },
  colorButtonTextActive: {
    color: '#fff',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  modeButtonActive: {
    borderColor: '#e94560',
    backgroundColor: '#1a0a10',
  },
  modeTitle: {
    color: '#e0e0e0',
    fontWeight: '700',
    fontSize: 13,
  },
  modeDesc: {
    color: '#8892a4',
    fontSize: 11,
    marginTop: 2,
  },
  list: {
    flex: 1,
  },
  openingItem: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  openingItemActive: {
    borderColor: '#e94560',
  },
  openingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  openingName: {
    color: '#e0e0e0',
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
  },
  openingEco: {
    color: '#e94560',
    fontSize: 12,
    fontWeight: '600',
  },
  openingDesc: {
    color: '#8892a4',
    fontSize: 12,
    lineHeight: 16,
  },
  startButton: {
    backgroundColor: '#e94560',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  startButtonDisabled: {
    backgroundColor: '#333',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
