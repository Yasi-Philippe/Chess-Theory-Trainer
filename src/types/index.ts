export type PlayerColor = 'white' | 'black';

/** theory = play through opening theory then free play; free = Stockfish best moves from move 1 */
export type OpeningMode = 'theory' | 'free';

export type OpeningCategory = 'main_line' | 'advanced';

export interface Opening {
  id: string;
  name: string;
  eco: string;
  color: PlayerColor;
  category: OpeningCategory;
  /** PGN moves that define the opening (e.g. ["e4", "e5", "Nf3", "Nc6", "Bb5"]) */
  moves: string[];
  description: string;
}

export interface StockfishMove {
  uci: string;        // e.g. "e2e4"
  san: string;        // e.g. "e4"  (filled after parsing)
  score: number;      // centipawns
  wdl: WDL;
}

export interface WDL {
  win: number;
  draw: number;
  loss: number;
}

export type GamePhase =
  | 'OPENING_PHASE'   // Player replaying the opening moves
  | 'GAME_PHASE'      // Free play — player must find best move
  | 'ENGINE_TURN'     // Stockfish is computing / animating its move
  | 'GAME_OVER';

export interface GameState {
  phase: GamePhase;
  moveCount: number;
  consecutiveMisses: number;
  playerColor: PlayerColor;
  opening: Opening | null;
  openingMode: OpeningMode;
  /** Index into opening.moves for OPENING_PHASE */
  openingMoveIndex: number;
  isGameOver: boolean;
  gameOverReason: 'two_misses' | 'completed' | null;
}

export interface SetupParams {
  opening: Opening | null; // null in free mode
  color: PlayerColor;
  mode: OpeningMode;
}
