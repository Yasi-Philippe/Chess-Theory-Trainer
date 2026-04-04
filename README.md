# Chess Theory Trainer

A mobile-first chess training app focused on opening theory. You choose an opening, then play against Stockfish — but you must always find the engine's best move. Miss twice in a row and the game is over. Your score is how many correct moves you strung together.

---

## Table of Contents

- [Concept](#concept)
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
- [Known Limitations & Next Steps](#known-limitations--next-steps)

---

## Concept

This is not a chess game — it is a **chess training tool**.

The core loop:

1. Pick a color (White or Black) and an opening (e.g. Ruy López, Sicilian Najdorf).
2. Choose a training mode:
   - **Play Through** — replay the opening moves yourself before entering free play.
   - **From Position** — skip to the end of the opening and start free play immediately.
3. Against Stockfish, you must **always play the engine's top move**. There are no alternatives.
4. Stockfish responds by picking randomly from its **top 10 candidate moves**, weighted by win probability — so stronger moves are chosen more often, but there is variety.
5. Miss the best move once: you get a warning and one more chance.  
   Miss twice in a row: game over.
6. Your **score = number of correct moves** played before two consecutive misses.

---

## Features

- 20 curated openings — 10 for White, 10 for Black
- Two training modes per opening (play through theory / jump to position)
- Stockfish engine analysis via UCI protocol
- Top-10 multi-PV analysis with WDL (Win/Draw/Loss) weighted random selection
- Move count score + rating label on game over
- Full game state machine: Opening Phase → Game Phase → Engine Turn → Game Over
- Clean dark-themed UI designed for mobile portrait screens

---

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| Framework | React Native + Expo | 52 / SDK 52 |
| Navigation | expo-router (file-based) | 4.x |
| Chess board | react-native-chessboard | 0.1.2 |
| Chess logic | chess.js | 1.3.x |
| Engine | Stockfish via hidden WebView (UCI) | 10.x (asm.js) |
| Global state | zustand | 5.x |
| Styling | NativeWind (Tailwind for RN) | 4.x |
| Language | TypeScript (strict) | 5.x |

---

## Project Structure

```
Chess-Theory-Trainer/
│
├── app/                        # expo-router screens
│   ├── _layout.tsx             # Root navigator (Stack)
│   ├── index.tsx               # Home / landing screen
│   ├── setup.tsx               # Opening, color, and mode selection
│   ├── game.tsx                # Main game screen
│   └── game-over.tsx           # Score + rating screen
│
├── src/
│   ├── components/
│   │   ├── GameHUD/            # Score, miss counter, phase label, feedback
│   │   ├── MissIndicator/      # Green/red dots showing consecutive misses
│   │   └── OpeningSelector/    # Full opening picker UI
│   │
│   ├── hooks/
│   │   ├── useStockfish.ts     # Stockfish UCI bridge + weighted move selector
│   │   └── useChessGame.ts     # Game state machine, validation, opening replay
│   │
│   ├── store/
│   │   └── gameStore.ts        # zustand store — passes setup between screens
│   │
│   ├── data/
│   │   └── openings.ts         # Opening library (20 openings, SAN move sequences)
│   │
│   └── types/
│       └── index.ts            # All shared TypeScript types
│
├── assets/
│   ├── images/                 # App icon, splash screen
│   └── stockfish/
│       └── stockfish-bridge.html  # Reference HTML for the UCI WebView bridge
│
├── app.json                    # Expo config (name, slug, Android package, etc.)
├── babel.config.js
├── tailwind.config.js
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
  └─ stockfish.js (asm.js build, loaded from CDN)
      │
      │  ReactNativeWebView.postMessage(uciResponse)
      ▼
React Native (useStockfish hook)
```

**`useStockfish` hook** ([src/hooks/useStockfish.ts](src/hooks/useStockfish.ts)):
- Holds a `WebView` ref that game.tsx attaches to an invisible `<WebView>` component
- Exposes `getBestMove(fen, color)` → analyses with `MultiPV 10` + `UCI_ShowWDL true`, returns top 10 moves
- Exposes `getTopMove(fen, color)` → analyses with `MultiPV 1`, returns only the best move
- Parses `info depth ... multipv N score cp X wdl W D L pv MOVE` lines from the engine
- Uses a Promise-based queue: `go depth` is sent, result resolved on `bestmove` response

**Weighted random selection** (`weightedRandomMove`):
```
win_probability(move) = wdl.win / (wdl.win + wdl.draw + wdl.loss)

Each move's selection weight = max(win_probability, 0.01)
Selected via weighted random draw over all 10 candidates
```
A move with 60% win rate has exactly 2× the selection chance of a move with 30% win rate.

---

### Game Logic

**`useChessGame` hook** ([src/hooks/useChessGame.ts](src/hooks/useChessGame.ts)):

Maintains a `chess.js` instance as the source of truth for position state (separate from the board's internal state). Exposes a clean API to `game.tsx`:

| Method | Description |
|---|---|
| `onPlayerMove(from, to, promotion?)` | Validates the player's move. Returns `'accepted'`, `'wrong_move'`, or `'illegal'`. |
| `requestEngineMove()` | Calls Stockfish, picks a weighted move, applies it to internal state, returns `{from, to}` for board animation. |
| `resetGame()` | Resets all state and FEN to the opening starting position. |

**Game state machine:**

```
                ┌──────────────────┐
                │  OPENING_PHASE   │  (play_through mode only)
                │  Player replays  │
                │  opening moves   │
                └────────┬─────────┘
                         │ opening complete
                         ▼
          ┌──────────────────────────────┐
          │         GAME_PHASE           │◄──────────────────┐
          │  Player must find best move  │                   │
          └──────────┬───────────────────┘                   │
                     │                                       │
          ┌──────────▼──────────┐                           │
          │  player move valid? │                           │
          └──┬──────────────────┘                           │
             │ yes                    no → miss++           │
             │                        ├─ misses < 2: retry  │
             │                        └─ misses = 2 ──► GAME_OVER
             ▼
     ┌───────────────┐
     │  ENGINE_TURN  │ ──── Stockfish picks from top 10 ───►  board animates
     └───────┬───────┘
             │
             └─────────────────────────────────────────────►(back to GAME_PHASE)
```

**Miss tracking:**  
`consecutiveMisses` is reset to 0 on every correct move. It only increases on wrong moves. Two consecutive wrong moves triggers `GAME_OVER`.

---

### Board Integration

`react-native-chessboard` manages its own internal chess state. It does not re-render when the `fen` prop changes after mount. The screen communicates with it exclusively through a `ChessboardRef`:

| Ref method | When used |
|---|---|
| `ref.move({ from, to })` | Engine makes a move — triggers the board's built-in animation |
| `ref.resetBoard(fen)` | Player plays wrong move — snaps board back to last valid position |
| `ref.getState().fen` | Read current board FEN (after a player move) |

The **source-of-truth FEN** is kept in `useChessGame`'s internal `chess.js` instance, not in the board. The board is a display + input layer only.

---

## Openings Library

20 openings are included in [src/data/openings.ts](src/data/openings.ts):

**White**

| Name | ECO |
|---|---|
| Ruy López | C65 |
| Ruy López — Berlin Defense | C65 |
| Italian Game | C50 |
| Giuoco Piano | C54 |
| King's Gambit | C30 |
| Queen's Gambit | D06 |
| Queen's Gambit Declined | D50 |
| London System | D02 |
| Catalan Opening | E04 |
| English Opening | A10 |

**Black**

| Name | ECO |
|---|---|
| Scandinavian Defense | B01 |
| Sicilian — Najdorf | B90 |
| Sicilian — Dragon | B70 |
| French Defense | C00 |
| Caro-Kann Defense | B10 |
| King's Indian Defense | E61 |
| Grünfeld Defense | D70 |
| Nimzo-Indian Defense | E20 |
| Dutch Defense | A80 |
| Queen's Indian Defense | E12 |

Each opening stores a `moves[]` array in SAN notation (both sides, in order). Adding new openings is a matter of appending an entry to this array.

---

## Getting Started

**Prerequisites**

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npm install -g expo`)
- Android device or emulator (primary target)

**Install dependencies**

```bash
cd Chess-Theory-Trainer
npm install
```

**Start the development server**

```bash
npx expo start
```

---

## Running on Android

**Option A — Expo Go (fastest)**

1. Install [Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent) on your Android device
2. Run `npx expo start`
3. Scan the QR code with the Expo Go app

**Option B — Development build (recommended for WebView)**

Because the app uses a hidden WebView for the Stockfish engine, a development build gives more reliable behaviour than Expo Go:

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

## Known Limitations & Next Steps

| Item | Status | Notes |
|---|---|---|
| **Stockfish offline** | Pending | Currently loads `stockfish.js` from a CDN. For offline support, bundle the file locally via `expo-asset` + `expo-file-system`. |
| **Board orientation** | Pending | `react-native-chessboard` v0.1.x has no `boardOrientation` prop. Playing as Black shows White at the bottom. Fix: apply `scaleY: -1` transform to the board view and counter-rotate each piece. |
| **Opening phase auto-reply** | In progress | In `play_through` mode, the opponent's opening replies are applied directly to the chess.js instance but not yet animated on the board (the board shows the resulting position via `resetBoard`). Smooth animation for opponent replies can be added via `ref.move()`. |
| **Piece images** | Pending | `assets/images/` needs icon.png, splash.png, and adaptive-icon.png before building. |
| **iOS support** | Ready | No iOS-specific code exists. The app will run on iOS via Expo with no changes. |
| **PC / Web support** | Ready | `app.json` has `"web"` configured with Metro bundler. Run `npx expo start --web` to test. |
