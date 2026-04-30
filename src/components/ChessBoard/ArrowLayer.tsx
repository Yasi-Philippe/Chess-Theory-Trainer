import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import type { ArrowEntry } from './types';

// Stub — react-native-svg will be wired in once dependency is installed.
type Props = {
  arrows: ArrowEntry[];
};

export const ArrowLayer = memo(function ArrowLayer(_props: Props) {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" />;
});
