import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Opening, PlayerColor, OpeningMode } from '../../types';
import { OPENINGS_BY_COLOR } from '../../data/openings';

interface OpeningSelectorProps {
  onSelect: (opening: Opening | null, color: PlayerColor, mode: OpeningMode) => void;
}

export function OpeningSelector({ onSelect }: OpeningSelectorProps) {
  const insets = useSafeAreaInsets();
  const [selectedColor, setSelectedColor] = useState<PlayerColor>('white');
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
  const [selectedMode, setSelectedMode] = useState<OpeningMode>('theory');
  const [search, setSearch] = useState('');

  const allOpenings = OPENINGS_BY_COLOR[selectedColor];

  const filteredOpenings = useMemo(() => {
    if (!search.trim()) return allOpenings;
    const q = search.toLowerCase();
    return allOpenings.filter(
      o =>
        o.name.toLowerCase().includes(q) ||
        o.eco.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q),
    );
  }, [allOpenings, search]);

  function handleStart() {
    if (selectedMode === 'theory' && !selectedOpening) return;
    onSelect(selectedOpening, selectedColor, selectedMode);
  }

  const canStart = selectedMode === 'free' || !!selectedOpening;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      {/* ── Color selection ── */}
      <Text style={styles.sectionTitle}>Play as</Text>
      <View style={styles.colorRow}>
        {(['white', 'black'] as PlayerColor[]).map(color => (
          <TouchableOpacity
            key={color}
            style={[styles.colorButton, selectedColor === color && styles.colorButtonActive]}
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
              {color === 'white' ? '♔  White' : '♚  Black'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Mode selection ── */}
      <Text style={styles.sectionTitle}>Training mode</Text>
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeButton, selectedMode === 'theory' && styles.modeButtonActive]}
          onPress={() => setSelectedMode('theory')}
        >
          <Text style={[styles.modeTitle, selectedMode === 'theory' && styles.modeTitleActive]}>
            Theory Mode
          </Text>
          <Text style={styles.modeDesc}>
            Play through an opening line, then find Stockfish's best moves
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeButton, selectedMode === 'free' && styles.modeButtonActive]}
          onPress={() => {
            setSelectedMode('free');
            setSelectedOpening(null);
          }}
        >
          <Text style={[styles.modeTitle, selectedMode === 'free' && styles.modeTitleActive]}>
            Free Mode
          </Text>
          <Text style={styles.modeDesc}>
            Play vs Stockfish from move 1 — always find the engine's best move
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Opening list (Theory Mode only) ── */}
      {selectedMode === 'theory' && (
        <>
          <Text style={styles.sectionTitle}>
            Select opening
            <Text style={styles.countBadge}> ({filteredOpenings.length})</Text>
          </Text>

          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or ECO…"
            placeholderTextColor="#555e6e"
            value={search}
            onChangeText={setSearch}
          />

          <FlatList
            data={filteredOpenings}
            keyExtractor={item => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.openingItem,
                  selectedOpening?.id === item.id && styles.openingItemActive,
                ]}
                onPress={() => setSelectedOpening(item)}
              >
                <View style={styles.openingHeader}>
                  <Text style={styles.openingName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.openingEco}>{item.eco}</Text>
                </View>
                <Text style={styles.openingDesc} numberOfLines={2}>
                  {item.description}
                </Text>
                <Text style={styles.openingMoves}>
                  {item.moves.length} moves in theory line
                </Text>
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {/* Free mode spacer */}
      {selectedMode === 'free' && <View style={styles.freeModeSpacer} />}

      {/* ── Start button ── */}
      <TouchableOpacity
        style={[styles.startButton, !canStart && styles.startButtonDisabled]}
        onPress={handleStart}
        disabled={!canStart}
      >
        <Text style={styles.startButtonText}>
          {selectedMode === 'free' ? 'Start Free Play' : 'Start Theory Training'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16, // overridden inline to add safe area inset
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
  countBadge: {
    color: '#e94560',
    fontWeight: '700',
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
    fontWeight: '700',
    fontSize: 15,
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
    color: '#8892a4',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 4,
  },
  modeTitleActive: {
    color: '#e94560',
  },
  modeDesc: {
    color: '#555e6e',
    fontSize: 11,
    lineHeight: 15,
  },
  searchInput: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e0e0e0',
    fontSize: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#0f3460',
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
    backgroundColor: '#200d14',
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
    marginRight: 8,
  },
  openingEco: {
    color: '#e94560',
    fontSize: 12,
    fontWeight: '700',
  },
  openingDesc: {
    color: '#8892a4',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  openingMoves: {
    color: '#555e6e',
    fontSize: 11,
  },
  freeModeSpacer: {
    flex: 1,
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
