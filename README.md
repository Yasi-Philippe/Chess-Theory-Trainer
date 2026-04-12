# Chess Theory Trainer

A mobile-first chess training app (Android) focused on opening theory. Pick an opening, play against Stockfish — but you must always find the engine's best move. Miss twice in a row and the game ends. Your score is the number of correct moves you strung together.

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
3. Against Stockfish, you must **always play the engine's top move**. There are no alternatives.
4. Stockfish responds by picking randomly from its **top 10 candidate moves**, weighted by win probability — stronger moves appear more often, but there is variety.
5. Miss the best move once: you get a warning and one more chance.  
   Miss twice in a row: game over.
6. **Score = number of correct moves** before two consecutive misses.

---

## Training Modes

### Theory Mode
Select an opening (e.g. Ruy López, Sicilian Najdorf). Starting from move 1, both you and the opponent follow the exact theoretical line. Once the theory ends, free play begins: you must find Stockfish's best move every turn.

### Free Mode
No opening selection required. Start from the initial position and play directly against Stockfish — every move must be the engine's top choice from move 1 onwards. No theory to follow.

---

## Features

- **65+ curated openings** across all major ECO families (A–E), for both White and Black
- **Searchable opening picker** — filter by name, ECO code, or description
- **Two training modes** — Theory (follow theory + free play) and Free (Stockfish from move 1)
- **Stockfish fully offline** — engine bundled with the app, no internet required
- **Loading overlay** — spinner shows until Stockfish sends `readyok`; gestures are locked until then
- **Turn-aware Theory Mode** — when playing as Black, White's first opening moves auto-play before you interact
- Top-10 multi-PV analysis with **WDL-weighted random selection** for engine replies
- Move count score + rating label on game over (Beginner → Grandmaster)
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
| Engine | Stockfish (asm.js, bundled offline) | 10.x |
| Global state | zustand | 5.x |
| Styling | NativeWind (Tailwind for RN) | 4.x |
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
│   │   └── useChessGame.ts       # Game state machine, validation, opening replay
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
├── babel.config.js               # NativeWind jsxImportSource + reanimated plugin
└── tsconfig.json
```

---

## Architecture

### Stockfish Integration

Stockfish cannot run natively in React Native JavaScript. The solution is a **hidden WebView** that acts as a sandboxed UCI engine environment.

```
React Native (game.tsx)
      │
      │  postMessage(uciCommand)
      ▼
  WebView (0×0, invisible)
  └─ stockfish.js  ← inlined from assets/stockfish/stockfish.js.txt (offline)
      │
      │  ReactNativeWebView.postMessage(uciResponse)
      ▼
React Native (useStockfish hook)
```

**Offline loading flow** (`useStockfish.ts`):

1. On mount: `Asset.loadAsync(require('.../stockfish.js.txt'))` — Expo copies the file to the app's local cache
2. `FileSystem.readAsStringAsync(localUri)` — reads the 1.5 MB asm.js engine into a string
3. The string is injected as an inline `<script>` block inside the bridge HTML
4. The WebView renders with the fully self-contained HTML — no network request ever
5. When the engine sends `readyok`, `isEngineReady` is set to `true` and the loading overlay clears

**`useStockfish` hook**:
- Exposes `getBestMove(fen)` → `MultiPV 10` + `UCI_ShowWDL true`, returns top 10 moves
- Exposes `getTopMove(fen)` → `MultiPV 1`, returns only the best move (used to validate player moves)
- Parses `info depth … multipv N score cp X wdl W D L pv MOVE` lines from the engine
- Promise-based queue: `go depth` is sent, result resolved on `bestmove` response

**Weighted random selection** (`weightedRandomMove`):
```
win_probability(move) = wdl.win / (wdl.win + wdl.draw + wdl.loss)
weight(move)          = max(win_probability, 0.01)
selected              = weighted random draw over all 10 candidates
```
A move with 60% win probability gets exactly 2× the selection chance of one with 30%.

---

### Game Logic

**`useChessGame` hook** (`src/hooks/useChessGame.ts`):

Maintains a `chess.js` instance as the authoritative game state, separate from the board's internal state. Exposes a clean API:

| Export | Description |
|---|---|
| `onPlayerMove(from, to, promotion?)` | Validates the player's move; returns `'accepted'`, `'wrong_move'`, or `'illegal'`. Guards against out-of-turn moves. |
| `requestEngineMove()` | Calls Stockfish, picks a weighted-random move from top 10, applies it, returns `{from, to}` for board animation. |
| `playOpponentOpeningMove()` | Advances one opponent theory move; used when the opponent must move before the player can interact (e.g. playing as Black). |
| `resetGame()` | Resets chess.js and all state to the initial position. |
| `isOpponentOpeningTurn` | `true` when Theory Mode + Black + opponent has not yet played their first theory move. |

**Turn enforcement in Theory Mode:**

Opening moves alternate White/Black starting from index 0. A helper `isPlayerTurnAtIndex(index, color)` determines if the player or opponent should move. When `isOpponentOpeningTurn` is `true`, `game.tsx` fires a `setTimeout(400ms)` to auto-animate the opponent's move before enabling player input.

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
               │   GAME_PHASE    │◄────────────────────────┐
               │  Find best move │                         │
               └────────┬────────┘                         │
                        │                                  │
              ┌─────────▼──────────┐                       │
              │ player move valid? │                       │
              └──┬─────────────────┘                       │
                 │ yes                 no → miss++          │
                 │                    ├─ misses < 2: retry  │
                 │                    └─ misses = 2 ──► GAME_OVER
                 ▼
         ┌──────────────┐
         │ ENGINE_TURN  │ ── Stockfish picks from top 10 ──► board animates
         └──────┬───────┘
                └─────────────────────────────────────────►(back to GAME_PHASE)
```

**Miss tracking:** `consecutiveMisses` resets to 0 on every correct move. Two consecutive wrong moves triggers `GAME_OVER`.

---

### Board Integration

`react-native-chessboard` manages its own internal chess state and does not re-render when the `fen` prop changes after mount. Communication happens exclusively through `ChessboardRef`:

| Ref method | When used |
|---|---|
| `ref.move({ from, to })` | Engine or opponent makes a move — triggers built-in animation |
| `ref.resetBoard(fen?)` | Snap back after a wrong move, or full reset on restart |

The **source-of-truth FEN** lives in `useChessGame`'s `chess.js` instance. The board is a display + gesture input layer only.

**Animation guard:** An `animatingRef` flag is set during any `ref.move()` or `ref.resetBoard()` call. While `true`, `gestureEnabled` is forced to `false` and `onPlayerMove` returns `'illegal'` immediately, preventing race conditions.

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
- Android device or emulator

**Install dependencies**

```bash
cd Chess-Theory-Trainer
npm install
```

**Start the development server**

```bash
# On local network (recommended for physical device)
npx expo start --host lan

# Or via tunnel if on different network
npx expo start --tunnel
```

---

## Running on Android

**Option A — Expo Go (fastest, no build needed)**

1. Install [Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent) on your Android device
2. Make sure your phone and computer are on the same Wi-Fi network
3. Run `npx expo start --host lan`
4. Scan the QR code shown in the terminal with the Expo Go app

> **Note:** On the first launch after install, the engine takes 1–3 seconds to load. A spinner overlay shows until Stockfish is ready.

**Option B — Development build (more reliable WebView behaviour)**

```bash
npx expo install expo-dev-client
npx expo run:android
```

**Option C — Production APK (EAS Build)**

```bash
npm install -g eas-cli
eas build --platform android --profile preview
```

---

## Known Limitations

| Item | Status | Notes |
|---|---|---|
| **Board flip for Black** | Not implemented | `react-native-chessboard` v0.1.x has no `boardOrientation` prop. Rotating the view 180° breaks GestureHandler `translationX/Y` (screen-relative deltas don't invert). Playing as Black still shows the board from White's perspective. |
| **Piece scale on pickup** | By design | The board library scales pieces to 1.2× when you drag them. This is hardcoded in the library's `Piece` component and cannot be disabled via props. |
| **iOS support** | Untested | No iOS-specific code; should run via Expo Go with no changes. |
