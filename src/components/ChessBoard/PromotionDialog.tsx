import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import type { Color, PieceSymbol } from './types';
import { PIECE_LABEL } from './constants';

const PROMOTION_PIECES: PieceSymbol[] = ['q', 'r', 'b', 'n'];

type Props = {
  visible: boolean;
  color: Color;
  onSelect: (piece: PieceSymbol) => void;
};

export const PromotionDialog = memo(function PromotionDialog({ visible, color, onSelect }: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Promote to</Text>
          <View style={styles.row}>
            {PROMOTION_PIECES.map(p => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.option,
                  { backgroundColor: color === 'w' ? '#f5f0e8' : '#2a1a0e' },
                ]}
                onPress={() => onSelect(p)}
              >
                <Text style={[styles.optionText, { color: color === 'w' ? '#333' : '#eee' }]}>
                  {PIECE_LABEL[p]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
    gap: 16,
    alignItems: 'center',
  },
  title: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  option: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 28,
    fontWeight: '700',
  },
});
