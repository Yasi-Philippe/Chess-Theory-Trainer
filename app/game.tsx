import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Chessboard from 'react-native-chessboard';
import type { ChessboardRef } from 'react-native-chessboard';
import type { Move, Square } from 'chess.js';
import { useRouter } from 'expo-router';
import { GameHUD } from '../src/components/GameHUD/GameHUD';
import { MissIndicator } from '../src/components/MissIndicator/MissIndicator';
import { useChessGame } from '../src/hooks/useChessGame';
import { useStockfish } from '../src/hooks/useStockfish';
import { useGameStore } from '../src/store/gameStore';
import type { Opening, PlayerColor, OpeningMode } from '../src/types';

const BOARD_SIZE = Dimensions.get('window').width;

// Fallback setup so TypeScript is happy — router.replace guards against null in practice
const FALLBACK_SETUP: { opening: Opening; color: PlayerColor; mode: OpeningMode } = {
  opening: {
    id: 'ruy_lopez',
    name: 'Ruy López',
    eco: 'C65',
    color: 'white',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    description: '',
  },
  color: 'white',
  mode: 'from_position',
};

export default function GameScreen() {
  const router = useRouter();
  const setup = useGameStore(state => state.setup) ?? FALLBACK_SETUP;

  const boardRef = useRef<ChessboardRef>(null);

  const { webviewRef, getBestMove, getTopMove, bridgeHtml, onWebViewMessage } =
    useStockfish();

  const { state, onPlayerMove, requestEngineMove, resetGame } = useChessGame({
    opening: setup.opening,
    playerColor: setup.color,
    mode: setup.mode,
    getBestMove,
    getTopMove,
  });

  // Navigate to game-over when game ends
  useEffect(() => {
    if (state.phase === 'GAME_OVER') {
      router.push({
        pathname: '/game-over',
        params: { score: String(state.moveCount) },
      });
    }
  }, [state.phase]);

  /**
   * Called when the board needs to show the engine's move.
   * Fetches the best move from Stockfish (weighted random from top 10),
   * then animates it on the board.
   */
  const playEngineMove = useCallback(async () => {
    const engineMove = await requestEngineMove();
    if (engineMove) {
      await boardRef.current?.move({ from: engineMove.from, to: engineMove.to });
    }
  }, [requestEngineMove]);

  // Trigger engine move whenever phase becomes ENGINE_TURN
  useEffect(() => {
    if (state.phase === 'ENGINE_TURN') {
      playEngineMove();
    }
  }, [state.phase]);

  /**
   * Intercept player moves from the board.
   * The board has already applied the move visually — we validate it and
   * call resetBoard if it was wrong.
   */
  const handleBoardMove = useCallback(
    async ({ move }: { move: Move; state: any }) => {
      const from = move.from as Square;
      const to = move.to as Square;
      const promotion = move.promotion;

      const result = await onPlayerMove(from, to, promotion);

      if (result.outcome === 'wrong_move' || result.outcome === 'illegal') {
        // Snap the board back to the last valid position
        boardRef.current?.resetBoard(state.lastValidFen);
        return;
      }

      // For opening phase: the hook may have already computed the opponent's
      // opening reply and returned it in engineMove
      if (result.engineMove && result.outcome === 'accepted') {
        await boardRef.current?.move({
          from: result.engineMove.from,
          to: result.engineMove.to,
        });
      }
    },
    [onPlayerMove, state.lastValidFen],
  );

  const handleReset = useCallback(() => {
    resetGame();
    boardRef.current?.resetBoard(state.startingFen);
  }, [resetGame, state.startingFen]);

  const isPlayerTurn =
    state.phase === 'GAME_PHASE' || state.phase === 'OPENING_PHASE';

  return (
    <View style={styles.container}>
      {/* Hidden Stockfish WebView — zero-size, off-screen */}
      <WebView
        ref={webviewRef}
        source={{ html: bridgeHtml }}
        onMessage={onWebViewMessage}
        style={styles.hiddenWebview}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
      />

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

      {/* Chess board */}
      <View style={styles.boardWrapper}>
        <Chessboard
          ref={boardRef}
          fen={state.startingFen}
          boardSize={BOARD_SIZE}
          onMove={handleBoardMove}
          gestureEnabled={isPlayerTurn}
          colors={{
            black: '#b58863',
            white: '#f0d9b5',
          }}
        />
      </View>

      {/* Bottom controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.controlText}>Restart</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backTextStyle}>Change Opening</Text>
        </TouchableOpacity>
      </View>
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
  boardWrapper: {
    alignSelf: 'center',
    marginVertical: 8,
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 'auto',
  },
  resetButton: {
    flex: 1,
    backgroundColor: '#0f3460',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backButton: {
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
  backTextStyle: {
    color: '#8892a4',
    fontWeight: '600',
  },
});
