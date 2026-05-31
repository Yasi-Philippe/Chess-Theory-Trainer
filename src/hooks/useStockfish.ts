import { useRef, useCallback, useEffect, useState } from 'react';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { StockfishMove, WDL } from '../types';

const ANALYSIS_DEPTH = 8;
const MULTI_PV = 10;
const ANALYSIS_TIMEOUT_MS = 8000;

interface UseStockfishReturn {
  webviewRef: React.RefObject<WebView>;
  getEligibleSet: (fen: string) => Promise<StockfishMove[]>;
  htmlUri: string;
  onWebViewMessage: (event: { nativeEvent: { data: string } }) => void;
  isEngineReady: boolean;
  isError: boolean;
  errorMessage: string | null;
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────

function parseInfoLine(line: string): { rank: number; move: StockfishMove } | null {
  if (!line.startsWith('info') || !line.includes('multipv') || !line.includes(' pv ')) {
    return null;
  }
  const multipvMatch = line.match(/multipv (\d+)/);
  if (!multipvMatch) return null;
  const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
  if (!pvMatch) return null;
  const cpMatch = line.match(/score cp (-?\d+)/);
  const mateMatch = line.match(/score mate (-?\d+)/);
  const wdlMatch = line.match(/wdl (\d+) (\d+) (\d+)/);

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

// This Stockfish build (niklasf/stockfish.js, Emscripten-compiled) is designed
// as a Web Worker. It does NOT expose a STOCKFISH() constructor. Instead:
//   • Input:  it sets window.onmessage as its UCI command receiver
//   • Output: it calls postMessage(line) to emit UCI responses
//
// Bridge strategy:
//   1. Override window.postMessage before the script loads → captures engine output
//   2. After the script executes, window.onmessage is the engine's input handler
//   3. RN→WebView commands (dispatched on document by react-native-webview)
//      are forwarded to window.onmessage({data: cmd})
function buildBridgeHtml(engineScript: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body>
<script>
  // Queue messages until ReactNativeWebView is injected by the native layer.
  // On some Android versions the injection is async relative to script execution.
  var _rnQueue = [];
  function sendToRN(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(String(msg));
    } else {
      _rnQueue.push(String(msg));
    }
  }
  // Flush queued messages once the bridge is available (polls every 50 ms).
  var _flushInterval = setInterval(function() {
    if (window.ReactNativeWebView && _rnQueue.length) {
      clearInterval(_flushInterval);
      var q = _rnQueue.splice(0);
      for (var i = 0; i < q.length; i++) {
        window.ReactNativeWebView.postMessage(q[i]);
      }
    }
  }, 50);

  // Intercept the engine's UCI output — the script calls postMessage(line)
  // which in Worker context posts to the parent; here we reroute it to RN.
  window.postMessage = function(msg) {
    if (typeof msg === 'string') sendToRN(msg);
  };

  var cmdQueue = [];
  var engineReady = false;

  // React Native → WebView: react-native-webview dispatches a 'message' event
  // on the document when webviewRef.postMessage(cmd) is called from RN.
  document.addEventListener('message', function(event) {
    var cmd = typeof event === 'string' ? event : event.data;
    if (typeof cmd !== 'string') return;
    if (!engineReady) { cmdQueue.push(cmd); return; }
    window.onmessage && window.onmessage({data: cmd});
  });

  window.onerror = function(msg, src, line) {
    sendToRN('JS_ERROR:' + msg + ' (' + (src || '') + ':' + line + ')');
  };
<\/script>
<script>
${engineScript}
<\/script>
<script>
  // The engine script has now executed and set window.onmessage.
  if (typeof window.onmessage === 'function') {
    engineReady = true;
    sendToRN('LOG:Engine loaded, sending UCI init');
    window.onmessage({data: 'uci'});
    window.onmessage({data: 'setoption name UCI_ShowWDL value true'});
    window.onmessage({data: 'setoption name MultiPV value ${MULTI_PV}'});
    window.onmessage({data: 'isready'});
    for (var i = 0; i < cmdQueue.length; i++) {
      window.onmessage({data: cmdQueue[i]});
    }
    cmdQueue = [];
  } else {
    sendToRN('ENGINE_ERROR:window.onmessage not set after engine script');
  }
<\/script>
</body>
</html>`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStockfish(): UseStockfishReturn {
  const webviewRef = useRef<WebView>(null);
  const [htmlUri, setHtmlUri] = useState('');
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingAnalysis = useRef<{
    resolve: (moves: StockfishMove[]) => void;
    reject: (err: Error) => void;
    moves: Map<number, StockfishMove>;
  } | null>(null);

  // Each time we send 'stop', the engine replies with a bestmove for the
  // cancelled analysis. This counter tracks how many such replies to skip
  // so they don't prematurely resolve the next pending analysis.
  const stopCountRef = useRef(0);

  // Queued after a 'stop' command. The start callback is executed when 'readyok'
  // arrives, guaranteeing the engine has fully flushed the stop before the new
  // 'go'. The reject is stored so we can cancel this queued request if a third
  // analyse() call arrives before readyok comes back.
  const pendingPostReadyRef = useRef<{
    start: () => void;
    reject: (err: Error) => void;
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
        if (__DEV__) console.log('[Stockfish] Reading asset from', asset.localUri);
        const scriptContent = await FileSystem.readAsStringAsync(asset.localUri!);
        if (__DEV__) console.log('[Stockfish] Script loaded, length =', scriptContent.length);

        const htmlPath = FileSystem.cacheDirectory + 'stockfish-bridge.html';
        await FileSystem.writeAsStringAsync(htmlPath, buildBridgeHtml(scriptContent));
        if (__DEV__) console.log('[Stockfish] Bridge HTML written to', htmlPath);
        setHtmlUri(htmlPath);
      } catch (e) {
        console.error('[Stockfish] Failed to load engine:', e);
        setIsError(true);
        setErrorMessage('Engine failed to load. Please restart the app.');
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
      if (__DEV__) console.log('[WebView→RN]', line.substring(0, 120));

      if (line === 'readyok') {
        if (pendingPostReadyRef.current) {
          const { start } = pendingPostReadyRef.current;
          pendingPostReadyRef.current = null;
          start();
        } else {
          if (__DEV__) console.log('[Stockfish] Engine ready');
          setIsEngineReady(true);
        }
        return;
      }

      if (line.startsWith('bestmove')) {
        if (stopCountRef.current > 0) {
          stopCountRef.current -= 1;
          return;
        }
        if (pendingAnalysis.current) {
          const { resolve, moves } = pendingAnalysis.current;
          pendingAnalysis.current = null;
          resolve(Array.from(moves.values()));
        }
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
      const analysisPromise = new Promise<StockfishMove[]>((resolve, reject) => {
        const startAnalysis = () => {
          pendingAnalysis.current = { resolve, reject, moves: new Map() };
          sendCommand('ucinewgame');
          sendCommand(`position fen ${fen}`);
          sendCommand(`setoption name MultiPV value ${multiPV}`);
          sendCommand(`go depth ${ANALYSIS_DEPTH}`);
        };

        if (pendingAnalysis.current) {
          // Cancel the in-flight analysis. Null it out immediately so stale
          // info/bestmove lines arriving before readyok are ignored.
          sendCommand('stop');
          stopCountRef.current += 1;
          pendingAnalysis.current.reject(new Error('Cancelled'));
          pendingAnalysis.current = null;

          // Queue the new analysis behind readyok. The UCI spec guarantees
          // readyok is sent AFTER the bestmove from the stop, so the engine
          // is in a clean state before we send the next go.
          pendingPostReadyRef.current = { start: startAnalysis, reject };
          sendCommand('isready');
        } else if (pendingPostReadyRef.current) {
          // A prior cancel is already waiting for readyok. Reject the queued
          // analysis's promise (so its 8s timeout doesn't fire as an error)
          // and replace it with this newer request.
          pendingPostReadyRef.current.reject(new Error('Cancelled'));
          pendingPostReadyRef.current = { start: startAnalysis, reject };
        } else {
          startAnalysis();
        }
      });

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Engine timeout')), ANALYSIS_TIMEOUT_MS);
      });

      return Promise.race([analysisPromise, timeoutPromise])
        .then(result => { clearTimeout(timeoutId); return result; })
        .catch(err => {
          clearTimeout(timeoutId);
          if (pendingAnalysis.current) {
            sendCommand('stop');
            stopCountRef.current += 1;
            pendingAnalysis.current = null;
          }
          if (pendingPostReadyRef.current) {
            pendingPostReadyRef.current.reject(new Error('Cancelled'));
            pendingPostReadyRef.current = null;
          }
          const msg = err instanceof Error ? err.message : 'Engine error';
          if (msg !== 'Cancelled') {
            if (__DEV__) console.error('[Stockfish] Analysis error:', msg);
            setIsError(true);
            setErrorMessage('Engine failed to respond. Please restart the app.');
          }
          throw err;
        });
    },
    [sendCommand],
  );

  // Returns the set of moves the engine considers genuinely good for the position.
  // Used for both player move validation and engine move selection — the same set.
  //
  // Algorithm:
  //   1. Take up to 10 candidates from Stockfish.
  //   2. If the best move has win probability > 50%, discard any move below 50%.
  //   3. Discard any move whose win probability is below (best × 0.90).
  //   4. Return what remains (1–10 moves, position-dependent).
  const getEligibleSet = useCallback(
    async (fen: string): Promise<StockfishMove[]> => {
      const candidates = await analyse(fen, MULTI_PV);
      if (candidates.length === 0) return [];

      const bestWin = winProbability(candidates[0].wdl);
      const threshold = bestWin * 0.9;

      return candidates.filter(m => {
        const w = winProbability(m.wdl);
        if (bestWin > 0.5 && w < 0.5) return false;
        return w >= threshold;
      });
    },
    [analyse],
  );

  return {
    webviewRef,
    getEligibleSet,
    htmlUri,
    onWebViewMessage,
    isEngineReady,
    isError,
    errorMessage,
  };
}
