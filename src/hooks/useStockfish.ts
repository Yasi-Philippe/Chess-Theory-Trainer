import { useRef, useCallback, useEffect, useState } from 'react';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { StockfishMove, WDL, PlayerColor } from '../types';

const ANALYSIS_DEPTH = 15;
const MULTI_PV = 10;

interface UseStockfishReturn {
  webviewRef: React.RefObject<WebView>;
  getBestMove: (fen: string, color: PlayerColor) => Promise<StockfishMove[]>;
  getTopMove: (fen: string, color: PlayerColor) => Promise<StockfishMove>;
  htmlUri: string;
  onWebViewMessage: (event: { nativeEvent: { data: string } }) => void;
  isEngineReady: boolean;
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────

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
    score = parseInt(mateMatch[1], 10) > 0 ? 30000 : -30000;
  } else if (cpMatch) {
    score = parseInt(cpMatch[1], 10);
  }

  const wdl: WDL = wdlMatch
    ? { win: parseInt(wdlMatch[1], 10), draw: parseInt(wdlMatch[2], 10), loss: parseInt(wdlMatch[3], 10) }
    : { win: 500, draw: 0, loss: 500 };

  return { rank, move: { uci, san: '', score, wdl } };
}

function winProbability(wdl: WDL): number {
  const total = wdl.win + wdl.draw + wdl.loss;
  if (total === 0) return 0;
  return wdl.win / total;
}

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

// ─── Bridge HTML builder ──────────────────────────────────────────────────────

function buildBridgeHtml(engineScript: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body>
<script>
  var engine = null;
  var msgQueue = [];

  function sendToRN(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(String(msg));
    }
  }

  function initEngine() {
    try {
      sendToRN('LOG:initEngine running, STOCKFISH type=' + typeof STOCKFISH);
      if (typeof STOCKFISH !== 'function') {
        sendToRN('ENGINE_ERROR:STOCKFISH not a function');
        return;
      }
      engine = STOCKFISH();
      sendToRN('LOG:engine object created');
      engine.onmessage = function(e) {
        var msg = (typeof e === 'object' && e.data) ? e.data : String(e);
        sendToRN(msg);
      };
      engine.postMessage('uci');
      engine.postMessage('setoption name UCI_ShowWDL value true');
      engine.postMessage('setoption name MultiPV value ${MULTI_PV}');
      engine.postMessage('isready');
      for (var i = 0; i < msgQueue.length; i++) {
        engine.postMessage(msgQueue[i]);
      }
      msgQueue = [];
    } catch(err) {
      sendToRN('ENGINE_ERROR:' + err.message);
    }
  }

  function handleMsg(event) {
    var data = (typeof event === 'string') ? event : event.data;
    if (!engine) {
      // Engine not ready yet — queue the command for after init
      msgQueue.push(data);
      return;
    }
    engine.postMessage(data);
  }

  document.addEventListener('message', handleMsg);
  window.addEventListener('message', handleMsg);
  window.onerror = function(msg, src, line) {
    sendToRN('JS_ERROR:' + msg + ' (' + src + ':' + line + ')');
  };
<\/script>
<script>
${engineScript}
<\/script>
<script>
  // Invoke initEngine here — after the engine script above has fully executed
  // and STOCKFISH is guaranteed to be defined. The load event is unreliable
  // in the Android file:// WebView context.
  initEngine();
<\/script>
</body>
</html>`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStockfish(): UseStockfishReturn {
  const webviewRef = useRef<WebView>(null);
  const [htmlUri, setHtmlUri] = useState('');
  const [isEngineReady, setIsEngineReady] = useState(false);

  const pendingAnalysis = useRef<{
    resolve: (moves: StockfishMove[]) => void;
    reject: (err: Error) => void;
    moves: Map<number, StockfishMove>;
    multiPV: number;
  } | null>(null);

  useEffect(() => {
    async function loadEngine() {
      try {
        const [asset] = await Asset.loadAsync(
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('../../assets/stockfish/stockfish.js.txt')
        );
        if (!asset.localUri) {
          await asset.downloadAsync();
        }
        console.log('[Stockfish] Reading asset from', asset.localUri);
        const scriptContent = await FileSystem.readAsStringAsync(asset.localUri!);
        console.log('[Stockfish] Script loaded, length =', scriptContent.length);

        // Write the full bridge HTML to the cache dir and hand the WebView a
        // file:// URI. This avoids serialising 1.5 MB across the RN bridge on
        // every render, which was causing the long hang on the loading screen.
        const htmlPath = FileSystem.cacheDirectory + 'stockfish-bridge.html';
        await FileSystem.writeAsStringAsync(htmlPath, buildBridgeHtml(scriptContent));
        console.log('[Stockfish] Bridge HTML written to', htmlPath);
        setHtmlUri(htmlPath);
      } catch (e) {
        console.error('[Stockfish] Failed to load engine:', e);
      }
    }
    loadEngine();
  }, []);

  const sendCommand = useCallback((cmd: string) => {
    webviewRef.current?.postMessage(cmd);
  }, []);

  const onWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const line = event.nativeEvent.data;
      // Log every message so we can see if anything comes back at all
      console.log('[WebView→RN]', line.substring(0, 120));

      if (line === 'readyok') {
        console.log('[Stockfish] Engine ready');
        setIsEngineReady(true);
        return;
      }

      if (line.startsWith('bestmove') && pendingAnalysis.current) {
        const { resolve, moves } = pendingAnalysis.current;
        pendingAnalysis.current = null;
        resolve(Array.from(moves.values()));
        return;
      }

      const parsed = parseInfoLine(line);
      if (parsed && pendingAnalysis.current) {
        pendingAnalysis.current.moves.set(parsed.rank, parsed.move);
      }
    },
    [],
  );

  const analyse = useCallback(
    (fen: string, multiPV: number): Promise<StockfishMove[]> => {
      return new Promise((resolve, reject) => {
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
    htmlUri,
    onWebViewMessage,
    isEngineReady,
  };
}
