import React, {
  forwardRef,
  memo,
  useImperativeHandle,
  useEffect,
} from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { squareToXY, xyToSquare } from './boardUtils';
import { useBoardContext } from './BoardContext';
import {
  DRAG_SCALE,
  SNAP_DURATION_MS,
  MOVE_ANIM_DURATION_MS,
  TAP_MAX_DISTANCE,
  PIECE_LABEL,
  PIECE_COLOR,
} from './constants';
import type { Square, BoardPiece } from './types';

export type PieceRef = {
  animateTo: (target: Square) => Promise<void>;
  snapBack: () => void;
  resetTranslate: () => void;
};

type Props = {
  piece: BoardPiece;
  onTap: (square: Square) => void;
  onDrop: (from: Square, to: Square) => void;
  onPremoveTap: (square: Square) => void;
  onPremoveDrop: (from: Square, to: Square) => void;
};

export const Piece = memo(
  forwardRef<PieceRef, Props>(function Piece(
    { piece, onTap, onDrop, onPremoveTap, onPremoveDrop },
    ref,
  ) {
    const { squareSize, boardSize, flipped, playerColor, turnSV, isAnimatingSV } =
      useBoardContext();

    const { x: baseX, y: baseY } = squareToXY(piece.square, squareSize, flipped);

    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);
    const isActive = useSharedValue(false);

    // Reset translate whenever the piece's square changes (piece moved to new position).
    // Both board-side and translate must be consistent in the same commit.
    useEffect(() => {
      translateX.value = 0;
      translateY.value = 0;
    }, [piece.square]);

    useImperativeHandle(ref, () => ({
      animateTo: (target: Square): Promise<void> => {
        return new Promise(resolve => {
          const { x: tx, y: ty } = squareToXY(target, squareSize, flipped);
          const dx = tx - baseX;
          const dy = ty - baseY;
          translateX.value = withTiming(dx, { duration: MOVE_ANIM_DURATION_MS }, finished => {
            if (finished) runOnJS(resolve)();
          });
          translateY.value = withTiming(dy, { duration: MOVE_ANIM_DURATION_MS });
        });
      },
      snapBack: () => {
        translateX.value = withTiming(0, { duration: SNAP_DURATION_MS });
        translateY.value = withTiming(0, { duration: SNAP_DURATION_MS });
        scale.value = withTiming(1, { duration: 80 });
        isActive.value = false;
      },
      resetTranslate: () => {
        translateX.value = 0;
        translateY.value = 0;
        scale.value = withTiming(1, { duration: 80 });
        isActive.value = false;
      },
    }));

    const isMyPiece = piece.color === playerColor;

    // Gesture is registered on all of the player's own pieces (constant per piece).
    // Worklet callbacks read isAnimatingSV at event time (UI thread) to bail out
    // during animations — avoids 32 re-renders when animation state changes.
    const gesture = Gesture.Pan()
      .enabled(isMyPiece)
      .onBegin(() => {
        'worklet';
        if (isAnimatingSV.value) return;
        isActive.value = true;
        scale.value = withTiming(DRAG_SCALE, { duration: 80 });
      })
      .onChange(e => {
        'worklet';
        if (!isActive.value) return;
        translateX.value = e.translationX;
        translateY.value = e.translationY;
      })
      .onEnd(e => {
        'worklet';
        if (!isActive.value) return;
        const dist = Math.sqrt(e.translationX ** 2 + e.translationY ** 2);
        const isMyTurn = turnSV.value === playerColor;

        if (dist < TAP_MAX_DISTANCE) {
          // Tap
          translateX.value = withTiming(0, { duration: SNAP_DURATION_MS });
          translateY.value = withTiming(0, { duration: SNAP_DURATION_MS });
          scale.value = withTiming(1, { duration: 80 });
          isActive.value = false;
          if (isMyTurn) {
            runOnJS(onTap)(piece.square);
          } else {
            runOnJS(onPremoveTap)(piece.square);
          }
          return;
        }

        // Drag — compute drop square
        const centerX = baseX + squareSize / 2 + e.translationX;
        const centerY = baseY + squareSize / 2 + e.translationY;
        const clampedX = Math.max(0, Math.min(boardSize - 1, centerX));
        const clampedY = Math.max(0, Math.min(boardSize - 1, centerY));
        const targetSq = xyToSquare(clampedX, clampedY, squareSize, flipped);

        scale.value = withTiming(1, { duration: 80 });

        if (!targetSq || targetSq === piece.square) {
          translateX.value = withTiming(0, { duration: SNAP_DURATION_MS });
          translateY.value = withTiming(0, { duration: SNAP_DURATION_MS });
          isActive.value = false;
          return;
        }

        if (isMyTurn) {
          runOnJS(onDrop)(piece.square, targetSq);
        } else {
          translateX.value = withTiming(0, { duration: SNAP_DURATION_MS });
          translateY.value = withTiming(0, { duration: SNAP_DURATION_MS });
          isActive.value = false;
          runOnJS(onPremoveDrop)(piece.square, targetSq);
        }
      })
      .onFinalize(() => {
        'worklet';
        isActive.value = false;
        scale.value = withTiming(1, { duration: 80 });
      });

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      zIndex: isActive.value ? 1000 : 2,
      elevation: isActive.value ? 8 : 0,
    }));

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.piece,
            { width: squareSize, height: squareSize, left: baseX, top: baseY },
            { backgroundColor: piece.color === 'w' ? '#f5f0e8' : '#2a1a0e' },
            animatedStyle,
          ]}
        >
          <Text style={[styles.label, { color: piece.color === 'w' ? '#333' : '#eee', fontSize: squareSize * 0.48 }]}>
            {PIECE_LABEL[piece.type]}
          </Text>
        </Animated.View>
      </GestureDetector>
    );
  }),
);

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  label: {
    fontWeight: '700',
    includeFontPadding: false,
  },
});
