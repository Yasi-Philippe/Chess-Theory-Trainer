import React, {
  forwardRef,
  memo,
  useImperativeHandle,
  useRef,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { Piece } from './Piece';
import type { PieceRef } from './Piece';
import type { Square, BoardPiece, MoveData } from './types';

export type PiecesRef = {
  animatePiece: (params: MoveData) => Promise<void>;
  snapBack: (square: Square) => void;
  resetTranslate: (square: Square) => void;
  resetAllTranslates: () => void;
};

type Props = {
  pieces: BoardPiece[];
  onTap: (square: Square) => void;
  onDrop: (from: Square, to: Square) => void;
  onPremoveTap: (square: Square) => void;
  onPremoveDrop: (from: Square, to: Square) => void;
};

// React 19: createRef<T> returns RefObject<T | null>
type PieceRefObject = React.RefObject<PieceRef | null>;

export const Pieces = memo(
  forwardRef<PiecesRef, Props>(function Pieces(
    { pieces, onTap, onDrop, onPremoveTap, onPremoveDrop },
    ref,
  ) {
    const pieceRefs = useRef<Map<Square, PieceRefObject>>(new Map());

    // Ensure we have a ref for every piece currently on the board
    for (const p of pieces) {
      if (!pieceRefs.current.has(p.square)) {
        pieceRefs.current.set(p.square, React.createRef<PieceRef>());
      }
    }
    // Prune refs for squares that no longer have pieces
    const squareSet = new Set(pieces.map(p => p.square));
    for (const sq of pieceRefs.current.keys()) {
      if (!squareSet.has(sq)) pieceRefs.current.delete(sq);
    }

    useImperativeHandle(ref, () => ({
      animatePiece: ({ from, to }: MoveData): Promise<void> => {
        const pieceRef = pieceRefs.current.get(from);
        if (!pieceRef?.current) return Promise.resolve();
        return pieceRef.current.animateTo(to);
      },
      snapBack: (square: Square) => {
        pieceRefs.current.get(square)?.current?.snapBack();
      },
      resetTranslate: (square: Square) => {
        pieceRefs.current.get(square)?.current?.resetTranslate();
      },
      resetAllTranslates: () => {
        for (const ref of pieceRefs.current.values()) {
          ref.current?.resetTranslate();
        }
      },
    }));

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {pieces.map(p => {
          let r = pieceRefs.current.get(p.square);
          if (!r) {
            r = React.createRef<PieceRef>();
            pieceRefs.current.set(p.square, r);
          }
          return (
            <Piece
              key={p.square}
              ref={r as React.Ref<PieceRef>}
              piece={p}
              onTap={onTap}
              onDrop={onDrop}
              onPremoveTap={onPremoveTap}
              onPremoveDrop={onPremoveDrop}
            />
          );
        })}
      </View>
    );
  }),
);
