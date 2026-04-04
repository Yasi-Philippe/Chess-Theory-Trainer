import { useRef, useCallback, useEffect } from 'react';
import { WebView } from 'react-native-webview';
import { StockfishMove, WDL, PlayerColor } from '../types';

/**
 * Depth at which Stockfish analyses positions.
 * 15 is a good balance between speed and quality on mobile.
 */
const ANALYSIS_DEPTH = 15;
const MULTI_PV = 10;

interface UseStockfishReturn {
  /** Ref to attach to the hidden WebView component */
  webviewRef: React.RefObject<WebView>;
  /** Analyse a position and return top N moves weighted for engine selection */
  getBestMove: (fen: string, color: PlayerColor) => Promise<StockfishMove[]>;
  /** Get only the #1 best move for player validation */
  getTopMove: (fen: string, color: PlayerColor) => Promise<StockfishMove>;
  /** HTML source string to pass to the hidden WebView */
  bridgeHtml: string;
  /** Handler to pass to WebView's onMessage prop */
  onWebViewMessage: (event: { nativeEvent: { data: string } }) => void;
}

/**
 * Parses a Stockfish "info depth ... multipv N score cp X wdl W D L pv MOVE"
 * line into a StockfishMove.
 *
 * Example line:
 *   info depth 15 seldepth 20 multipv 1 score cp 34 wdl 512 211 277 nodes 123456 pv e2e4 e7e5
 */
function parseInfoLine(line: string): { rank: number; move: StockfishMove } | null {
  if (!line.startsWith('info') || !line.includes('multipv') || !line.includes(' pv ')) {
    return null;
  }

  const multipvMatch = line.match(/multipv (\d+)/);
  const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
  const cpMatch = line.match(/score cp (-?\d+)/);
  const mateMatch = line.match(/score mate (-?\d+)/);
  const wdlMatch = line.match(/wdl (\d+) (\d+) (\d+)/);

  if (!multipvMatch || !pvMatch) return null;

  const rank = parseInt(multipvMatch[1], 10);
  const uci = pvMatch[1];

  let score = 0;
  if (mateMatch) {
    // Treat forced mate as a very high score
    score = parseInt(mateMatch[1], 10) > 0 ? 30000 : -30000;
  } else if (cpMatch) {
    score = parseInt(cpMatch[1], 10);
  }

  const wdl: WDL = wdlMatch
    ? { win: parseInt(wdlMatch[1], 10), draw: parseInt(wdlMatch[2], 10), loss: parseInt(wdlMatch[3], 10) }
    : { win: 500, draw: 0, loss: 500 };

  return {
    rank,
    move: { uci, san: '', score, wdl },
  };
}

/**
 * Converts WDL win count to a win probability (0–1).
 * WDL values sum to 1000 in Stockfish's output.
 */
function winProbability(wdl: WDL): number {
  const total = wdl.win + wdl.draw + wdl.loss;
  if (total === 0) return 0;
  return wdl.win / total;
}

/**
 * Given a list of moves with win probabilities, pick one using weighted
 * random selection so that a move with 2× the win probability gets 2× the
 * chance of being selected.
 */
export function weightedRandomMove(moves: StockfishMove[]): StockfishMove {
  const weights = moves.map(m => Math.max(winProbability(m.wdl), 0.01));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * totalWeight;
  for (let i = 0; i < moves.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return moves[i];
  }
  return moves[0];
}

// ─── Bridge HTML (inline so no file-loading async needed) ────────────────────
const BRIDGE_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body>
<script>
  var engine = null;

  function sendToRN(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(String(msg));
    }
  }

  function initEngine() {
    try {
      if (typeof STOCKFISH === 'function') {
        engine = STOCKFISH();
      } else {
        sendToRN('ENGINE_ERROR:Cannot init Stockfish');
        return;
      }
      engine.onmessage = function(e) {
        var msg = (typeof e === 'object' && e.data) ? e.data : String(e);
        sendToRN(msg);
      };
      engine.postMessage('uci');
      engine.postMessage('setoption name UCI_ShowWDL value true');
      engine.postMessage('setoption name MultiPV value ${MULTI_PV}');
      engine.postMessage('isready');
    } catch(err) {
      sendToRN('ENGINE_ERROR:' + err.message);
    }
  }

  function handleMsg(event) {
    var data = (typeof event === 'string') ? event : event.data;
    if (!engine) { sendToRN('ENGINE_ERROR:Not ready'); return; }
    engine.postMessage(data);
  }

  document.addEventListener('message', handleMsg);
  window.addEventListener('message', handleMsg);
  window.addEventListener('load', initEngine);
<\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js"></script>
</body>
</html>`;

export function useStockfish(): UseStockfishReturn {
  const webviewRef = useRef<WebView>(null);

  /**
   * Pending analysis callbacks keyed by a unique token.
   * When we send a "go depth N" command we register a resolver here.
   * It's resolved when we receive "bestmove" from the engine.
   */
  const pendingAnalysis = useRef<{
    resolve: (moves: StockfishMove[]) => void;
    reject: (err: Error) => void;
    moves: Map<number, StockfishMove>;
    multiPV: number;
  } | null>(null);

  const sendCommand = useCallback((cmd: string) => {
    webviewRef.current?.postMessage(cmd);
  }, []);

  const onWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const line = event.nativeEvent.data;

      if (line.startsWith('bestmove') && pendingAnalysis.current) {
        const { resolve, moves } = pendingAnalysis.current;
        pendingAnalysis.current = null;
        // Return moves sorted by rank (best first)
        const sorted = Array.from(moves.values()).sort((a, b) => {
          // rank is stored temporarily in score field — see below
          return 0; // already inserted by rank
        });
        resolve(sorted);
        return;
      }

      const parsed = parseInfoLine(line);
      if (parsed && pendingAnalysis.current) {
        pendingAnalysis.current.moves.set(parsed.rank, parsed.move);
      }
    },
    [],
  );

  /**
   * Core analysis function. Sends position + go command, waits for bestmove.
   */
  const analyse = useCallback(
    (fen: string, multiPV: number): Promise<StockfishMove[]> => {
      return new Promise((resolve, reject) => {
        // Cancel any pending analysis
        if (pendingAnalysis.current) {
          sendCommand('stop');
          pendingAnalysis.current.reject(new Error('Cancelled'));
        }

        pendingAnalysis.current = { resolve, reject, moves: new Map(), multiPV };

        sendCommand('ucinewgame');
        sendCommand(`position fen ${fen}`);
        sendCommand(`setoption name MultiPV value ${multiPV}`);
        sendCommand(`go depth ${ANALYSIS_DEPTH}`);
      });
    },
    [sendCommand],
  );

  const getBestMove = useCallback(
    async (fen: string, _color: PlayerColor): Promise<StockfishMove[]> => {
      const moves = await analyse(fen, MULTI_PV);
      return moves.slice(0, MULTI_PV);
    },
    [analyse],
  );

  const getTopMove = useCallback(
    async (fen: string, _color: PlayerColor): Promise<StockfishMove> => {
      const moves = await analyse(fen, 1);
      if (moves.length === 0) throw new Error('No moves returned by engine');
      return moves[0];
    },
    [analyse],
  );

  return {
    webviewRef,
    getBestMove,
    getTopMove,
    bridgeHtml: BRIDGE_HTML,
    onWebViewMessage,
  };
}
