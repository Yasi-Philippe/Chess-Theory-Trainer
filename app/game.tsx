import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChessBoard } from '../src/components/ChessBoard';
import type { BoardRef } from '../src/components/ChessBoard';
import type { Square } from '../src/components/ChessBoard/types';
import { GameHUD } from '../src/components/GameHUD/GameHUD';
import { MissIndicator } from '../src/components/MissIndicator/MissIndicator';
import { useChessGame } from '../src/hooks/useChessGame';
import { useStockfish } from '../src/hooks/useStockfish';
import { useGameStore } from '../src/store/gameStore';
import type { PlayerColor, Opening } from '../src/types';

const SCREEN_WIDTH = Dimensions.get('window').width;

const FREE_MODE_FALLBACK = {
  opening: null as Opening | null,
  color: 'white' as PlayerColor,
  mode: 'free' as const,
};

export default function GameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setup = useGameStore(state => state.setup) ?? FREE_MODE_FALLBACK;

  const boardRef = useRef<BoardRef>(null);
  const premoveRef = useRef<{ from: Square; to: Square; promotion?: string } | null>(null);

  // Guards the ENGINE_TURN effect: prevents a new engine move from firing while
  // a board animation is still in progress (engine move, opening reply, premove).
  const [isAnimating, setIsAnimating] = useState(false);

  const { webviewRef, getEligibleSet, htmlUri, onWebViewMessage, isEngineReady, isError, errorMessage } =
    useStockfish();

  const {
    state,
    onPlayerMove,
    requestEngineMove,
    resetGame,
    playOpponentOpeningMove,
    isOpponentOpeningTurn,
    warmUp,
  } = useChessGame({
    opening: setup.opening,
    playerColor: setup.color,
    mode: setup.mode,
    getEligibleSet,
  });

  // Always-fresh refs so async callbacks never close over stale values.
  const stateRef = useRef(state);
  stateRef.current = state;
  const onPlayerMoveRef = useRef(onPlayerMove);
  onPlayerMoveRef.current = onPlayerMove;

  // Reset board on re-focus after game-over (Try Again flow).
  useFocusEffect(
    useCallback(() => {
      if (stateRef.current.phase === 'GAME_OVER') {
        premoveRef.current = null;
        resetGame();
        boardRef.current?.resetBoard();
      }
    }, [resetGame]),
  );

  // Navigate to game-over screen after a short delay so the best-move highlight
  // is visible before leaving.
  useEffect(() => {
    if (state.phase !== 'GAME_OVER') return;
    const timer = setTimeout(() => {
      router.push({
        pathname: '/game-over',
        params: {
          score: String(state.moveCount),
          reason: state.gameOverReason ?? 'two_misses',
          openingId: setup.opening?.id ?? '',
        },
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Engine move + queued premove execution ───────────────────────────────

  const playEngineMove = useCallback(async () => {
    const engineMove = await requestEngineMove();

    setIsAnimating(true);
    try {
      if (engineMove) {
        await boardRef.current?.move({ from: engineMove.from, to: engineMove.to });
      }

      // Execute any queued premove now that the engine animation is done.
      const pm = premoveRef.current;
      if (pm) {
        premoveRef.current = null;
        boardRef.current?.clearPremoveSelection();
        boardRef.current?.resetAllHighlightedSquares();

        const validFen = stateRef.current.lastValidFen;
        const result = await onPlayerMoveRef.current(pm.from, pm.to, pm.promotion);

        if (result.outcome === 'wrong_move' || result.outcome === 'illegal') {
          // Premove turned out to be invalid in the new position — revert board.
          boardRef.current?.resetBoard(validFen);
        } else {
          // Animate the premove visually (updates board chess state too).
          await boardRef.current?.move({ from: pm.from, to: pm.to });
          // Opening phase: also animate the opponent's reply if one was returned.
          if (result.engineMove) {
            await boardRef.current?.move({
              from: result.engineMove.from,
              to: result.engineMove.to,
            });
          }
        }
      }
    } finally {
      setIsAnimating(false);
    }
  }, [requestEngineMove]);

  // Fire engine move whenever phase becomes ENGINE_TURN and the engine is loaded.
  // `isAnimating` prevents a re-fire mid-animation (e.g. during premove execution).
  useEffect(() => {
    if (state.phase === 'ENGINE_TURN' && isEngineReady && !isAnimating) {
      playEngineMove();
    }
    // playEngineMove is stable (depends only on requestEngineMove which depends on getEligibleSet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, isEngineReady, isAnimating, playEngineMove]);

  // Warm up prefetch cache on the player's first move in free mode.
  // state.moveCount guards against re-firing on subsequent moves.
  useEffect(() => {
    if (isEngineReady && state.phase === 'GAME_PHASE' && state.moveCount === 0) {
      warmUp(state.lastValidFen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEngineReady, state.phase, state.moveCount, warmUp]);

  // Auto-play the opponent's opening move when it's their turn.
  useEffect(() => {
    if (!isOpponentOpeningTurn) return;
    const timer = setTimeout(async () => {
      setIsAnimating(true);
      try {
        const result = playOpponentOpeningMove();
        if (result) {
          await boardRef.current?.move({ from: result.move.from, to: result.move.to });
        }
      } finally {
        setIsAnimating(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpponentOpeningTurn, state.openingMoveIndex, playOpponentOpeningMove]);

  // ─── Board callbacks ───────────────────────────────────────────────────────

  // Called by ChessBoard after the player completes a valid gesture move.
  // Uses refs to stay stable across re-renders (no stale dependency issues).
  const handleMove = useCallback(async (params: { from: Square; to: Square; promotion?: string }) => {
    const { from, to, promotion } = params;
    const validFen = stateRef.current.lastValidFen;
    // Discard any queued premove when the player acts during the opening phase.
    // There is a brief window between commitMove finishing and the opponent's
    // animation starting where turnSV shows the opponent's color, which could
    // cause an accidental premove to be queued.
    if (stateRef.current.phase === 'OPENING_PHASE') {
      premoveRef.current = null;
    }
    const result = await onPlayerMoveRef.current(from, to, promotion);

    if (result.outcome === 'wrong_move' || result.outcome === 'illegal') {
      boardRef.current?.resetBoard(validFen);
      // Red flash on the square where the wrong move landed, then best-move hint
      boardRef.current?.flashSquare(to, '#ef444466', 400);
      if (result.bestMove) {
        setTimeout(() => {
          boardRef.current?.highlight({ square: result.bestMove!.from, color: '#f6f669aa' });
          boardRef.current?.highlight({ square: result.bestMove!.to,   color: '#baca44aa' });
        }, 50);
      }
      return;
    }

    // Opening phase: animate the opponent's reply returned by onPlayerMove.
    if (result.engineMove && result.outcome === 'accepted') {
      setIsAnimating(true);
      try {
        await boardRef.current?.move({
          from: result.engineMove.from,
          to: result.engineMove.to,
        });
      } finally {
        setIsAnimating(false);
      }
    }
  }, []);

  // Called by ChessBoard when the player queues a premove (engine turn).
  const handlePremove = useCallback((from: Square, to: Square) => {
    premoveRef.current = { from, to };
  }, []);

  const handleReset = useCallback(() => {
    premoveRef.current = null;
    resetGame();
    boardRef.current?.resetBoard();
  }, [resetGame]);

  const boardPlayerColor = setup.color === 'white' ? 'w' as const : 'b' as const;
  const modeLabel = setup.mode === 'free' ? 'Free Mode' : 'Theory Mode';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Hidden Stockfish WebView */}
      {htmlUri ? (
        <WebView
          ref={webviewRef}
          source={{ uri: htmlUri }}
          onMessage={onWebViewMessage}
          onLoadStart={() => { if (__DEV__) console.log('[WebView] load started'); }}
          onLoadEnd={() => { if (__DEV__) console.log('[WebView] load finished — waiting for readyok'); }}
          onError={e => { if (__DEV__) console.error('[WebView] error:', e.nativeEvent); }}
          style={styles.hiddenWebview}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          originWhitelist={['*']}
        />
      ) : null}

      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backChip}>
          <Text style={styles.backChipText}>← {modeLabel}</Text>
        </TouchableOpacity>
        {isEngineReady && state.phase === 'ENGINE_TURN' && (
          <View style={styles.thinkingChip}>
            <ActivityIndicator size="small" color="#e94560" />
            <Text style={styles.thinkingChipText}>Thinking…</Text>
          </View>
        )}
      </View>

      <GameHUD
        gameState={{
          phase: state.phase,
          moveCount: state.moveCount,
          consecutiveMisses: state.consecutiveMisses,
          playerColor: setup.color,
          opening: setup.opening,
          openingMode: setup.mode,
          openingMoveIndex: state.openingMoveIndex,
          isGameOver: state.phase === 'GAME_OVER',
          gameOverReason: state.gameOverReason,
        }}
        feedbackMessage={state.feedbackMessage}
      />

      <MissIndicator consecutiveMisses={state.consecutiveMisses} />

      <View style={styles.boardWrapper}>
        <ChessBoard
          ref={boardRef}
          boardSize={SCREEN_WIDTH}
          playerColor={boardPlayerColor}
          flipped={setup.color === 'black'}
          colors={{ light: '#f0d9b5', dark: '#b58863' }}
          onMove={handleMove}
          onPremove={handlePremove}
          withLetters={false}
          withNumbers={false}
        />
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.controlText}>Restart</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.changeButton} onPress={() => router.back()}>
          <Text style={styles.changeText}>Change Setup</Text>
        </TouchableOpacity>
      </View>

      {isError && (
        <View style={styles.engineOverlay}>
          <Text style={styles.engineErrorText}>⚠ {errorMessage}</Text>
          <TouchableOpacity style={styles.errorButton} onPress={() => router.back()}>
            <Text style={styles.errorButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      )}
      {!isEngineReady && !isError && state.phase !== 'OPENING_PHASE' && (
        <View style={styles.engineOverlay}>
          <ActivityIndicator size="large" color="#e94560" />
          <Text style={styles.engineLoadingText}>Loading engine…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  hiddenWebview: { width: 0, height: 0, position: 'absolute', opacity: 0 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backChipText: { color: '#8892a4', fontSize: 13, fontWeight: '600' },
  boardWrapper: { alignSelf: 'center' },
  controls: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  resetButton: {
    flex: 1,
    backgroundColor: '#0f3460',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  changeButton: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  controlText: { color: '#e0e0e0', fontWeight: '700' },
  changeText: { color: '#8892a4', fontWeight: '600' },
  thinkingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  thinkingChipText: { color: '#8892a4', fontSize: 12, fontWeight: '600' },
  engineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 26, 46, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    zIndex: 999,
  },
  engineLoadingText: { color: '#8892a4', fontSize: 15, fontWeight: '600' },
  engineErrorText: { color: '#e94560', fontSize: 15, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24 },
  errorButton: { marginTop: 16, backgroundColor: '#0f3460', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  errorButtonText: { color: '#e0e0e0', fontWeight: '700' },
});
