# Chess Theory Trainer

A mobile-first chess training app (Android) focused on opening theory. Pick an opening, play against Stockfish — but you must always find one of the engine's top moves. Miss twice in a row and the game ends. Your score is the number of correct moves you strung together.

---

## Table of Contents

- [Concept](#concept)
- [Training Modes](#training-modes)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
  - [Stockfish Integration](#stockfish-integration)
  - [Game Logic](#game-logic)
  - [Board Integration](#board-integration)
- [Openings Library](#openings-library)
- [Getting Started](#getting-started)
- [Running on Android](#running-on-android)
- [Known Limitations](#known-limitations)

---

## Concept

This is not a chess game — it is a **chess training tool**.

The core loop:

1. Pick a color (White or Black).
2. Choose a training mode (see below).
3. Against Stockfish, you must play **one of the engine's top 3 best moves**. If the position is winning (best move WDL > 50%), only moves that keep you winning are accepted.
4. Stockfish responds by picking randomly from its **top 10 candidate moves**, weighted by win probability — stronger moves appear more often, but there is variety.
5. Miss a top move once: you get a warning ("Not the best move. One more chance!"). The board reverts and you try again from the same position.
   Miss twice in a row: game over, the best move is revealed.
6. **Score = number of correct moves** before two consecutive misses.

---

## Training Modes

### Theory Mode
Select an opening (e.g. Ruy López, Sicilian Najdorf). Starting from move 1, both you and the opponent follow the exact theoretical line. Once the theory ends, free play begins: you must find one of Stockfish's top moves every turn.

### Free Mode
No opening selection required. Start from the initial position and play directly against Stockfish from move 1 onwards. When playing as Black, Stockfish automatically makes White's first move before you interact.

---

## Features

- **65+ curated openings** across all major ECO families (A–E), for both White and Black
- **Searchable opening picker** — filter by name, ECO code, or description
- **Two training modes** — Theory (follow theory + free play) and Free (Stockfish from move 1)
- **Top-3 move acceptance** — any of the engine's top 3 moves is accepted; rank shown ("Best move!", "2nd best move!", "3rd best move!")
- **Win-probability filter** — in winning positions, only moves that maintain the advantage are accepted
- **Stockfish fully offline** — engine bundled with the app, no internet required
- **Prefetch optimisation** — after Stockfish moves, the engine immediately computes the player's top-3 valid moves and its own reply to each in the background; validation and engine response are instant when the player moves
- **Loading overlay** — spinner shows until Stockfish sends `readyok`; gestures are locked until then
- **Thinking banner** — activity indicator shown while Stockfish is computing its reply
- **Turn-aware Theory Mode** — when playing as Black, White's opening moves auto-play before you interact
- **Castling move hints** — tapping the king shows dots on the castling target squares
- Top-10 multi-PV analysis with **WDL-weighted random selection** for engine replies
- Move count score + rating label on game over
- Full game state machine: Opening Phase → Game Phase → Engine Turn → Game Over
- **Safe area insets** — controls sit above the Android navigation bar
- Dark-themed UI designed for mobile portrait screens

---

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| Framework | React Native + Expo | SDK 54 |
| Navigation | expo-router (file-based) | 6.x |
| Chess board | react-native-chessboard | 0.1.2 |
| Chess logic | chess.js | 1.3.x |
| Engine | Stockfish (Emscripten/asm.js, bundled offline) | 10.x |
| Global state | zustand | 5.x |
| Language | TypeScript | 5.x |

---

## Project Structure

```
Chess-Theory-Trainer/
│
├── app/                          # expo-router screens
│   ├── _layout.tsx               # Root navigator (Stack + SafeAreaProvider)
│   ├── index.tsx                 # Home / landing screen
│   ├── setup.tsx                 # Mode + opening + color selection
│   ├── game.tsx                  # Main game screen
│   └── game-over.tsx             # Score + rating screen
│
├── src/
│   ├── components/
│   │   ├── GameHUD/              # Score, miss counter, phase label, feedback
│   │   ├── MissIndicator/        # Green/red dots showing consecutive misses
│   │   └── OpeningSelector/      # Full opening picker UI with search
│   │
│   ├── hooks/
│   │   ├── useStockfish.ts       # Offline Stockfish bridge + weighted move selector
│   │   └── useChessGame.ts       # Game state machine, validation, prefetch, opening replay
│   │
│   ├── store/
│   │   └── gameStore.ts          # zustand store — passes setup between screens
│   │
│   ├── data/
│   │   └── openings.ts           # 65+ openings (SAN move sequences, ECO codes)
│   │
│   └── types/
│       └── index.ts              # All shared TypeScript types
│
├── assets/
│   ├── images/                   # App icon, splash, adaptive icon
│   └── stockfish/
│       └── stockfish.js.txt      # Stockfish 10 asm.js build (1.5 MB, bundled offline)
│
├── app.json                      # Expo config (SDK 54, assets registration)
├── metro.config.js               # Registers .txt as a Metro asset extension
├── babel.config.js               # Reanimated plugin
└── tsconfig.json
```

---

## Architecture

### Stockfish Integration

Stockfish cannot run natively in React Native JavaScript. The solution is a **hidden WebView** (0×0, off-screen) that acts as a sandboxed UCI engine environment.

The bundled Stockfish build is an **Emscripten/Web Worker-style** binary. It does not expose a `STOCKFISH()` constructor. Instead:
- It sets `window.onmessage` as its UCI command receiver
- It calls `window.postMessage(line)` to emit UCI responses

**Bridge strategy:**

```
React Native (game.tsx)
      │
      │  webviewRef.postMessage(uciCommand)
      ▼
  WebView (0×0, invisible, loaded from file:// URI)
  ├─ overrides window.postMessage → forwards output to ReactNativeWebView.postMessage
  ├─ document.addEventListener('message') → forwards RN commands to window.onmessage
  └─ stockfish.js (Emscripten build, 1.5 MB, fully inline)
      │
      │  ReactNativeWebView.postMessage(uciResponse)
      ▼
React Native (useStockfish hook)
```

**Offline loading flow** (`useStockfish.ts`):

1. On mount: `Asset.loadAsync(require('.../stockfish.js.txt'))` — Expo copies the file to the app's local cache
2. `FileSystem.readAsStringAsync(localUri)` — reads the 1.5 MB engine into a string
3. The string is embedded as an inline `<script>` inside the bridge HTML, which is written to `FileSystem.cacheDirectory`
4. The WebView loads the HTML from a `file://` URI — no network request ever
5. Once the engine sends `readyok`, `isEngineReady` flips to `true` and the loading overlay clears

**`useStockfish` hook:**
- `getBestMove(fen)` → `MultiPV 10` + `UCI_ShowWDL true` at depth 8, returns top 10 moves
- Parses `info depth … multipv N score cp X wdl W D L pv MOVE` lines
- Promise-based: `go depth` sent, result resolved on `bestmove` response

**Weighted random selection** (`weightedRandomMove`):
```
win_probability(move) = wdl.win / (wdl.win + wdl.draw + wdl.loss)
weight(move)          = max(win_probability, 0.01)
selected              = weighted random draw over all 10 candidates
```

---

### Game Logic

**`useChessGame` hook** (`src/hooks/useChessGame.ts`):

Maintains a `chess.js` instance as the authoritative game state, separate from the board's internal state. Exposes a clean API:

| Export | Description |
|---|---|
| `onPlayerMove(from, to, promotion?)` | Validates the player's move against the prefetched top-3; returns `'accepted'`, `'wrong_move'`, or `'illegal'` |
| `requestEngineMove()` | Uses precomputed engine reply if available (instant); otherwise queries Stockfish live. Applies move and triggers next prefetch. |
| `playOpponentOpeningMove()` | Advances one opponent theory move; used in Theory Mode when opponent must move first |
| `resetGame()` | Resets chess.js and all state to the initial position |
| `isOpponentOpeningTurn` | `true` when Theory Mode + opponent must move before the player can interact |

**Move validation (Game Phase):**

```
getBestMove(fen, MultiPV=10)
         │
         ▼
  computeAcceptable(top10):
    top3 = top10[0..2]
    if winProb(top3[0]) > 0.5:          ← winning position
      filter: only moves where winProb >= 0.5
    else:
      accept all of top3
         │
         ▼
  player's move ∈ acceptable? → accepted (rank label: "Best move!" / "2nd best!" / "3rd best!")
                               → wrong_move (miss counter++)
```

**Prefetch system:**

After Stockfish makes its move, `startPrefetch(newFen)` runs in the background:
1. Computes the player's top-3 acceptable moves for the new position
2. For each of those moves, pre-computes the engine's best reply

When the player moves, validation and engine response are served from cache — **zero waiting time** in the common case. If the player moves before prefetch completes, the system falls back to a live Stockfish query.

**Game state machine:**

```
   Theory Mode                         Free Mode
        │                                  │
        ▼                                  │
 OPENING_PHASE  ──── opening ends ──►      │
 Player replays                            │
 opening moves                            │
        │                                  │
        └──────────────────────────────────┘
                         │
                         ▼
               ┌─────────────────┐
               │   GAME_PHASE    │◄──────────────────────┐
               │  Find top move  │                       │
               └────────┬────────┘                       │
                        │                                │
              ┌─────────▼──────────┐                     │
              │ move in top-3?     │                     │
              └──┬─────────────────┘                     │
                 │ yes                 no → miss++        │
                 │                    ├─ misses < 2: board reverts, retry
                 │                    └─ misses = 2 ──► GAME_OVER (best move revealed)
                 ▼
         ┌──────────────┐
         │ ENGINE_TURN  │ ── Stockfish picks from top 10 ──► board animates
         └──────┬───────┘
                └───────────────────────────────────────►(back to GAME_PHASE)
```

**Miss behaviour:**
- First miss: "Not the best move. One more chance!" — board reverts, no hint given
- Second consecutive miss: "Game over! Best move was [move]." — game ends

---

### Board Integration

`react-native-chessboard` manages its own internal chess state. Communication happens exclusively through `ChessboardRef`:

| Ref method | When used |
|---|---|
| `ref.move({ from, to })` | Engine or opponent makes a move — triggers built-in animation |
| `ref.resetBoard(fen?)` | Snap back after a wrong move, or full reset on restart |

The **source-of-truth FEN** lives in `useChessGame`'s `chess.js` instance. The board is a display + gesture input layer only.

**Wrong-move revert:** `resetBoard(validFen)` is deferred with `setTimeout(..., 0)` to ensure it runs after the board library's own synchronous `setBoard` call, preventing React 18 batching from causing the wrong state to win.

**Animation guard:** `animatingRef` (mutable ref) + `isAnimating` (useState) are kept in sync via a `setAnimating()` helper. `gestureEnabled` reads from the state value so React re-evaluates it after animations complete.

---

## Openings Library

65+ openings in `src/data/openings.ts`, covering all major ECO families:

**White (A–E)**

| Name | ECO |
|---|---|
| King's Pawn Opening | B00 |
| Ruy López — Main Line | C65 |
| Ruy López — Berlin Defense | C67 |
| Ruy López — Exchange Variation | C68 |
| Italian Game — Giuoco Piano | C54 |
| Italian Game — Evans Gambit | C51 |
| Italian Game — Two Knights | C55 |
| Scotch Game | C45 |
| Scotch Gambit | C44 |
| King's Gambit | C30 |
| Vienna Game | C25 |
| Bishop's Opening | C23 |
| Four Knights Game | C47 |
| French — Advance Variation | C02 |
| French — Tarrasch | C07 |
| Caro-Kann — Advance | B12 |
| Caro-Kann — Classical | B18 |
| Sicilian — Open (2.Nf3) | B20 |
| Sicilian — Alapin (2.c3) | B22 |
| Sicilian — Grand Prix Attack | B23 |
| Sicilian — Smith-Morra Gambit | B21 |
| Pirc — Austrian Attack | B09 |
| Alekhine's — Exchange | B03 |
| Queen's Gambit Accepted | D20 |
| Queen's Gambit Declined — Orthodox | D55 |
| Queen's Gambit — Exchange | D35 |
| London System | D02 |
| Colle System | D05 |
| Catalan — Open System | E04 |
| Catalan — Closed | E06 |
| Slav Defense — Main Line | D44 |
| Semi-Slav — Meran Variation | D47 |
| Nimzo-Indian — Rubinstein | E51 |
| Nimzo-Indian — Sämisch | E25 |
| King's Indian — Classical | E91 |
| King's Indian — Sämisch Attack | E81 |
| Grünfeld — Exchange Variation | D85 |
| English Opening — Main Line | A20 |
| English Opening — Four Knights | A28 |
| Réti Opening | A09 |
| Réti — King's Indian Attack | A07 |
| Queen's Indian Defense — 4.g3 | E15 |
| Bogo-Indian Defense | E11 |
| Modern Benoni | A65 |
| Dutch — Leningrad | A87 |
| Trompowsky Attack | A45 |
| Torre Attack | A46 |

**Black (defending vs 1.e4 and 1.d4)**

| Name | ECO |
|---|---|
| Sicilian — Najdorf (6.Bg5) | B99 |
| Sicilian — Dragon (Yugoslav) | B76 |
| Sicilian — Scheveningen | B80 |
| Sicilian — Kan (Paulsen) | B41 |
| Sicilian — Accelerated Dragon | B34 |
| French — Classical | C14 |
| French — Winawer | C15 |
| French — Tarrasch (Black) | C06 |
| Caro-Kann — Main Line | B17 |
| Caro-Kann — Advance (Black) | B12 |
| Pirc Defense — Classical | B08 |
| Petrov's Defense — Classical | C42 |
| Philidor's Defense | C41 |
| Scandinavian Defense | B01 |
| King's Gambit Declined | C30 |
| King's Indian — Classical (Black) | E92 |
| King's Indian — Mar del Plata | E99 |
| Grünfeld Defense — Classical | D82 |
| Nimzo-Indian — Classical (4.Qc2) | E32 |
| Queen's Indian — Petrosian | E12 |
| Queen's Gambit Declined — Tartakower | D58 |
| Slav Defense — Classical | D19 |
| Semi-Slav — Moscow Variation | D43 |
| Benoni Defense — Modern | A68 |
| Dutch — Stonewall | A92 |
| English — Symmetrical Defense | A36 |
| Bogo-Indian Defense (Black) | E11 |

Each opening stores `moves[]` in SAN notation (both sides, in order). Adding a new opening is one array entry in `src/data/openings.ts`.

---

## Getting Started

**Prerequisites**

- Node.js 20+
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npm install -g expo`)
- Android device or emulator with [Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)

**Install dependencies**

```bash
cd Chess-Theory-Trainer
npm install
```

**Start the development server**

```bash
# Recommended for physical device on the same Wi-Fi network
npx expo start --lan
```

> **Do not use `--clear` unless debugging a cache issue.** It wipes Metro's bundle cache and forces a full 60–90 second rebundle + Hermes recompilation on the device. Without `--clear`, subsequent starts use the cache and load in seconds.

**WSL2 users (Windows):** Metro binds to the WSL2 internal IP, which Android devices cannot reach directly. You need to set up a port proxy from your Windows LAN IP to the WSL2 internal IP (`netsh interface portproxy`) and re-run it after each WSL2 reboot since the internal IP changes.

---

## Running on Android

**Option A — Expo Go (fastest, no build needed)**

1. Install [Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent) on your Android device
2. Make sure your phone and computer are on the same Wi-Fi network
3. Run `npx expo start --lan`
4. Scan the QR code shown in the terminal with the Expo Go app

> **Note:** On the first launch, the Stockfish engine takes a few seconds to initialise. A spinner overlay is shown until the engine is ready; gestures are disabled until then.

**Option B — Production APK (EAS Build)**

```bash
npm install -g eas-cli
eas build --platform android --profile preview
```

---

## Known Limitations

| Item | Status | Notes |
|---|---|---|
| **Board flip for Black** | Not implemented | `react-native-chessboard` v0.1.x has no `boardOrientation` prop. Rotating the view 180° breaks GestureHandler `translationX/Y` (screen-relative deltas don't invert). Playing as Black still shows the board from White's perspective. |
| **Castling dots (node_modules patch)** | Patched in source | The library's `onSelectPiece` used SAN move strings (`'O-O'`) which never matched target square names. Fixed by switching to `chess.moves({ verbose: true })` in `node_modules/react-native-chessboard/src/context/board-operations-context/index.tsx`. This patch is lost on `npm install` — use `patch-package` to make it permanent if needed. |
| **Piece scale on pickup** | By design | The board library scales pieces to 1.2× when dragging. This is hardcoded in the library's `Piece` component and cannot be disabled via props. |
| **iOS support** | Untested | No iOS-specific code; should run via Expo Go with no changes. |
