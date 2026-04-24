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
import Chessboard from 'react-native-chessboard';
import type { ChessboardRef } from 'react-native-chessboard';
import type { Move, Square } from 'chess.js';
import { useRouter, useFocusEffect } from 'expo-router';
import { GameHUD } from '../src/components/GameHUD/GameHUD';
import { MissIndicator } from '../src/components/MissIndicator/MissIndicator';
import { useChessGame } from '../src/hooks/useChessGame';
import { useStockfish } from '../src/hooks/useStockfish';
import { useGameStore } from '../src/store/gameStore';
import type { PlayerColor, Opening } from '../src/types';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Free-mode fallback (no opening needed)
const FREE_MODE_FALLBACK = {
  opening: null as Opening | null,
  color: 'white' as PlayerColor,
  mode: 'free' as const,
};

export default function GameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setup = useGameStore(state => state.setup) ?? FREE_MODE_FALLBACK;

  const boardRef = useRef<ChessboardRef>(null);
  // Ref for synchronous animation guard (used inside callbacks without stale closure risk)
  const animatingRef = useRef(false);
  // State mirror so premove-clear effect re-fires after animations complete
  const [isAnimating, setIsAnimating] = useState(false);

  // Premove: queued move to execute once the engine finishes its turn
  const premoveRef = useRef<{ from: Square; to: Square; promotion?: string } | null>(null);

  function setAnimating(value: boolean) {
    animatingRef.current = value;
    setIsAnimating(value);
  }

  const { webviewRef, getBestMove, getTopMove, htmlUri, onWebViewMessage, isEngineReady } =
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
    getBestMove,
    getTopMove,
  });

  // When the user presses "Try Again" on the game-over screen we navigate
  // back to this screen (no new mount, engine stays warm).  Reset everything
  // so the game starts fresh.
  // Read phase via ref so the callback stays stable and only fires on focus
  // events — NOT every time state.phase changes.
  const stateRef = useRef(state);
  stateRef.current = state;
  useFocusEffect(
    useCallback(() => {
      if (stateRef.current.phase === 'GAME_OVER') {
        premoveRef.current = null;
        resetGame();
        boardRef.current?.resetBoard();
      }
    }, [resetGame]),
  );

  // Navigate to game-over when game ends.
  // Use a 1.5 s delay so the best-move highlight is visible before leaving.
  useEffect(() => {
    if (state.phase !== 'GAME_OVER') return;
    const timer = setTimeout(() => {
      router.push({
        pathname: '/game-over',
        params: { score: String(state.moveCount) },
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [state.phase]);

  /**
   * Wait for Stockfish to reply, animate the piece, then execute any queued premove.
   * setAnimating is deferred until we actually have a move to animate — keeping the
   * premove overlay active throughout the thinking phase.
   */
  const playEngineMove = useCallback(async () => {
    // Fetch the engine move first (Stockfish thinks here; overlay stays visible)
    const engineMove = await requestEngineMove();

    // Now block gestures for the duration of the animation only
    setAnimating(true);
    try {
      if (engineMove) {
        await boardRef.current?.move({ from: engineMove.from, to: engineMove.to });
      }
    } finally {
      setAnimating(false);
    }

    // Execute queued premove now that the board is idle and phase is GAME_PHASE
    const pm = premoveRef.current;
    if (pm) {
      premoveRef.current = null;
      await new Promise<void>(r => setTimeout(r, 50));
      boardRef.current?.resetAllHighlightedSquares();
      boardRef.current?.move({ from: pm.from, to: pm.to });
    }
  }, [requestEngineMove]);

  // Trigger Stockfish move whenever phase becomes ENGINE_TURN.
  // Also depends on isEngineReady: when playing as Black in free mode the phase
  // starts as ENGINE_TURN before the engine is loaded, so we must re-fire once
  // the engine becomes ready (otherwise the commands are sent to a null ref and
  // the analysis promise never resolves).
  useEffect(() => {
    if (state.phase === 'ENGINE_TURN' && isEngineReady) {
      playEngineMove();
    }
  }, [state.phase, isEngineReady]);

  // Warm up the prefetch cache as soon as the engine is ready and it's the
  // player's first move in GAME_PHASE (Free Mode as White).
  useEffect(() => {
    if (isEngineReady && state.phase === 'GAME_PHASE' && state.moveCount === 0) {
      warmUp(state.lastValidFen);
    }
  }, [isEngineReady, state.phase]);

  /**
   * When it's the opponent's turn in the opening (e.g. playing as Black,
   * White hasn't moved yet), auto-play the opponent's opening move.
   */
  useEffect(() => {
    if (!isOpponentOpeningTurn) return;

    const timer = setTimeout(async () => {
      setAnimating(true);
      try {
        const result = playOpponentOpeningMove();
        if (result) {
          await boardRef.current?.move({ from: result.move.from, to: result.move.to });
        }
      } finally {
        setAnimating(false);
      }
    }, 400); // short delay so the board is ready

    return () => clearTimeout(timer);
  }, [isOpponentOpeningTurn, state.openingMoveIndex]);

  /**
   * Intercept player moves from the board.
   */
  const handleBoardMove = useCallback(
    async ({ move }: { move: Move; state: any }) => {
      if (animatingRef.current) return;

      const from = move.from as Square;
      const to = move.to as Square;
      const promotion = move.promotion;

      // Snapshot the last valid FEN before async processing can mutate state.
      // We use a local variable captured before the await so it's never stale.
      const validFen = state.lastValidFen;
      const result = await onPlayerMove(from, to, promotion);

      if (result.outcome === 'wrong_move' || result.outcome === 'illegal') {
        // Revert the board first (deferred to beat React 18 batching).
        setTimeout(() => boardRef.current?.resetBoard(validFen), 0);
        // On 2nd miss: highlight the best move from/to squares after the board
        // has reverted, giving the player a visual cue before game-over navigation.
        if (result.bestMove) {
          setTimeout(() => {
            boardRef.current?.highlight({ square: result.bestMove!.from, color: '#f6f669aa' });
            boardRef.current?.highlight({ square: result.bestMove!.to,   color: '#baca44aa' });
          }, 50);
        }
        return;
      }

      // Opening phase: board already shows player's move; animate opponent's reply
      if (result.engineMove && result.outcome === 'accepted') {
        setAnimating(true);
        try {
          await boardRef.current?.move({
            from: result.engineMove.from,
            to: result.engineMove.to,
          });
        } finally {
          setAnimating(false);
        }
      }
    },
    [onPlayerMove, state.lastValidFen],
  );

  /**
   * Called by the board when the user selects a piece + destination during
   * ENGINE_TURN. Queues the move and shows orange highlights.
   */
  const handlePremove = useCallback((from: Square, to: Square) => {
    premoveRef.current = { from, to };
    boardRef.current?.highlight({ square: from, color: '#f6a82566' });
    boardRef.current?.highlight({ square: to,   color: '#f6a82566' });
  }, []);

  // Cancel any partial premove selection once the engine animation finishes
  // and control returns to the player.
  useEffect(() => {
    if (state.phase === 'GAME_PHASE' && !isAnimating) {
      boardRef.current?.clearPremoveSelection();
    }
  }, [state.phase, isAnimating]);

  const handleReset = useCallback(() => {
    premoveRef.current = null;
    resetGame();
    boardRef.current?.resetBoard();
  }, [resetGame]);

  const modeLabel = setup.mode === 'free' ? 'Free Mode' : 'Theory Mode';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Hidden Stockfish WebView — zero-size, off-screen */}
      {htmlUri ? (
        <WebView
          ref={webviewRef}
          source={{ uri: htmlUri }}
          onMessage={onWebViewMessage}
          onLoadStart={() => console.log('[WebView] load started')}
          onLoadEnd={() => console.log('[WebView] load finished — waiting for readyok')}
          onError={e => console.error('[WebView] error:', e.nativeEvent)}
          style={styles.hiddenWebview}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          originWhitelist={['*']}
        />
      ) : null}

      {/* Back button row + engine thinking indicator */}
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

      {/* HUD: opening name, score, phase */}
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
          gameOverReason: null,
        }}
        feedbackMessage={state.feedbackMessage}
      />

      {/* Miss indicator dots */}
      <MissIndicator consecutiveMisses={state.consecutiveMisses} />

      {/* Chess board — flipped for Black so h8 is bottom-left */}
      <View style={styles.boardWrapper}>
        <Chessboard
          ref={boardRef}
          boardSize={SCREEN_WIDTH}
          onMove={handleBoardMove}
          onPremove={handlePremove}
          flipped={setup.color === 'black'}
          colors={{
            black: '#b58863',
            white: '#f0d9b5',
          }}
          withLetters={false}
          withNumbers={false}
        />
      </View>

      {/* Bottom controls — above Android nav bar */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.controlText}>Restart</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.changeButton}
          onPress={() => router.back()}
        >
          <Text style={styles.changeText}>Change Setup</Text>
        </TouchableOpacity>
      </View>

      {/* Engine loading overlay — only block when the engine is actually needed.
          OPENING_PHASE uses the opening book, so play can start immediately. */}
      {!isEngineReady && state.phase !== 'OPENING_PHASE' && (
        <View style={styles.engineOverlay}>
          <ActivityIndicator size="large" color="#e94560" />
          <Text style={styles.engineLoadingText}>Loading engine…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  hiddenWebview: {
    width: 0,
    height: 0,
    position: 'absolute',
    opacity: 0,
  },
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
  backChipText: {
    color: '#8892a4',
    fontSize: 13,
    fontWeight: '600',
  },
  boardWrapper: {
    alignSelf: 'center',
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
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
  controlText: {
    color: '#e0e0e0',
    fontWeight: '700',
  },
  changeText: {
    color: '#8892a4',
    fontWeight: '600',
  },
  thinkingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  thinkingChipText: {
    color: '#8892a4',
    fontSize: 12,
    fontWeight: '600',
  },
  engineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 26, 46, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    zIndex: 999,
  },
  engineLoadingText: {
    color: '#8892a4',
    fontSize: 15,
    fontWeight: '600',
  },
});
