# Chess Theory Trainer — Audit Report (dev branch)

**Date:** 2026-05-31  
**Branch:** `dev`  
**Scope:** Full codebase audit — correctness, architecture, UX, completeness  
**Codebase size:** ~4,500 lines TypeScript across 25+ source files

---

## What the project does (dev branch)

Mobile chess training app (React Native / Expo, Android). The player picks a color and opening, then plays against Stockfish offline. **Theory Mode** has two phases: reproducing the opening line exactly, then finding the strongest moves freely. **Free Mode** skips the opening line entirely. Two consecutive wrong moves in the same position end the session; a correct move resets the counter to zero. The project includes a fully custom chess board with board flip, a SQLite opening database, a WebView-based Stockfish bridge, and a prefetch system for low-latency engine responses.

---

## What is fixed compared to the previous `main` audit

These issues are **resolved** in `dev` and do not appear below:

| Previously flagged | Resolution |
|---|---|
| Board flip not implemented | Custom board with full `flipped` prop support |
| `react-native-chessboard` library problems | Removed — replaced by custom board |
| Castling patch lost on `npm install` | Resolved — custom board handles castling natively |
| No error boundary | Added in `app/_layout.tsx` |
| Stockfish timeout — game freezes forever | Fixed — 8-second `Promise.race` in `useStockfish.ts:289` |
| Engine loading failure gives no feedback | Fixed — `isError` / `errorMessage` states exposed and shown |
| Stale FEN capture on wrong-move revert | Fixed — `stateRef.current` pattern in `game.tsx:63-64,173` |
| Promise cancellation for analysis | Improved — `stop` command + `stopCountRef` + `pendingPostReadyRef` |

---

## CRITICAL — Core gameplay is wrong

### 1. `computeAcceptable` algorithm does not match the intended design

**File:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L55-L60)

```typescript
function computeAcceptable(top10: StockfishMove[]): StockfishMove[] {
  const top3 = top10.slice(0, 3);
  if (top3.length === 0) return [];
  const positionIsWinning = winProb(top3[0].wdl) > 0.5;
  return positionIsWinning ? top3.filter(m => winProb(m.wdl) >= 0.5) : top3;
}
```

This is wrong in two ways:

**Hard-coded cap at 3.** The function always takes exactly 3 moves regardless of position. In a sharp tactical position there may be only 1 truly good move; in an open, balanced position there may be 8. Capping at 3 either accepts bad moves (when only 1-2 are good) or rejects good ones (when 5+ are equivalent).

**No proximity threshold.** The function has no concept of how close a move is to the best. A move with 35% win probability is accepted if it's in the top-3 of a losing position, even when other moves at 42% exist.

The intended algorithm (see DESIGN.md):
1. Take up to 10 candidates.
2. If top move > 50%: discard anything below 50%.
3. Discard anything below `top_win_prob × 0.90`.
4. Return the remaining set (1–10 moves, position-dependent).

This function is used in two places: player move validation (`handleGameMove` line 329) and prefetch (`startPrefetch` line 121). Both paths produce wrong results.

---

### 2. Engine live fallback selects from unfiltered top-10 — can play bad moves

**File:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L173-L179)

```typescript
const topMoves = await getBestMove(fen, engineColor);
if (topMoves.length === 0) return null;
const chosen = weightedRandomMove(topMoves);  // all 10, unfiltered
```

`getBestMove` returns up to 10 candidates. `weightedRandomMove` picks from all of them weighted by win probability. Because weak moves have low win probability they have low weight — but they can still be chosen. In a position where the best move wins 80% and move #10 wins 20%, the engine can play the 20% move. The player is then punished for not finding what the engine played.

The same filtering applied to player move validation must also be applied to engine move selection. The engine must only play from the eligible set.

---

### 3. Prefetch pre-computes the wrong thing — eligible set is computed live when it should be instant

**File:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L111-L148)

The current prefetch, triggered after the engine moves, does two things in sequence:
1. Compute the player's top-3 acceptable moves for the new position (Step 1, line 118)
2. For each acceptable move, pre-compute the engine's reply (Step 2, lines 126-143)

Step 2 is the wrong priority. The engine's reply can wait — the "thinking" banner covers that latency. What cannot wait is Step 1: the player needs instant feedback the moment they touch a piece. If the prefetch hasn't finished Step 1 yet (because it was busy on Step 2), the game falls back to a live query and the player sees a delay before knowing if their move was right.

The correct prefetch computes the eligible set only (Step 1), then serves the engine reply live. This halves prefetch cost and fixes the latency problem.

Additionally, Step 2 pre-computes engine replies for each of the player's top-3 acceptable moves — but the player may play none of them (a wrong move), making all that computation wasted. The current approach runs up to 4 Stockfish analyses per turn (1 for player validation + up to 3 for engine replies). The correct approach runs 1.

---

### 4. Free Mode does not accept opening theory moves

**File:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L314-L399)

`handleGameMove` (used for the game phase in both Theory and Free Mode) only accepts moves in the `acceptableMoves` list computed from Stockfish. There is no code path that checks if the player's move is a recognized opening theory move.

Per the design: in Free Mode, any move that appears in the theory database for the current position should be accepted as correct in addition to Stockfish's eligible set. This entire feature is missing.

---

## HIGH — Significant problems that degrade the experience

### 5. Three distinct game-over conditions all funnel to the same screen

**Files:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L377-L398), [app/game.tsx](app/game.tsx#L81-L87), [app/game-over.tsx](app/game-over.tsx)

The design specifies three different endings: two consecutive misses, checkmate, and draw. All three currently navigate to `/game-over` with only a `score` parameter. The game-over screen always shows "Game Over" and the description always says "You played N best moves before missing twice" — which is factually wrong when the game ended by checkmate or draw.

`useChessGame.ts` does return `gameOverReason: 'two_misses' | 'completed'` from `handleGameMove`, but this value is never passed into the navigation params at `game.tsx:84`, and the game-over screen has no parameter for it. Additionally, checkmate and draw are both grouped under `'completed'` with no distinction, even though chess.js exposes `isCheckmate()` and `isDraw()` separately.

---

### 6. "Opening complete" fires two different messages from two different code paths

**File:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L214,L277)

```typescript
// applyNextOpponentOpeningMove (line 214):
feedbackMessage: openingComplete ? 'Opening complete! Find the best moves.' : null,

// handleOpeningMove (line 277):
feedbackMessage: 'Opening complete! Now find the best moves.',
```

Two different messages for the same event, triggered by different code paths depending on whether the last opening move belongs to the opponent or the player. Only one canonical message should exist, defined in one place.

---

### 7. Pieces render as Unicode text characters, not images

**File:** [src/components/ChessBoard/Piece.tsx](src/components/ChessBoard/Piece.tsx#L178)

```typescript
<Text style={[styles.label, { fontSize: squareSize * 0.48 }]}>
  {PIECE_LABEL[piece.type]}
</Text>
```

Pieces are rendered as Unicode chess symbols (♟♙♜♖ etc.) on a solid-color background box. This is functional but has real problems:
- Unicode chess symbol rendering varies across Android versions and manufacturer fonts — pieces may display incorrectly on some devices.
- The solid background box obscures the board squares behind each piece, hurting spatial clarity on the board.
- No chess piece font is loaded; rendering depends on whatever glyph the OS happens to have.

Standard open-source SVG piece sets (e.g., Lichess's cburnett or merida sets) are freely available and straightforward to integrate via `react-native-svg`.

---

### 8. Local stats planned but entirely absent

The design specifies per-opening local stats: best score and total games played. Nothing is implemented — no AsyncStorage, no SQLite stats table, no read/write in the game-over flow. The score shown on the game-over screen disappears the moment the player navigates away.

---

### 9. Zustand store is never cleared after game over

**Files:** [src/store/gameStore.ts](src/store/gameStore.ts), [app/game.tsx](app/game.tsx#L34), [app/game-over.tsx](app/game-over.tsx)

`clearSetup()` exists in the store but is never called anywhere. After game over the store retains the previous setup indefinitely. The `FREE_MODE_FALLBACK` on `game.tsx:25` masks this (a null store entry silently defaults to free mode), making the bug invisible during normal use but still logically wrong.

---

## MEDIUM — Architecture and code quality problems

### 10. Tailwind / NativeWind installed, configured, and never used

**Files:** [tailwind.config.js](tailwind.config.js), [babel.config.js](babel.config.js), [package.json](package.json)

`tailwindcss`, `nativewind`, and the NativeWind Babel plugin are all present. Every component uses `StyleSheet.create()`. The Babel plugin runs on every Metro compilation for nothing.

---

### 11. `console.log` throughout production code

**Files:** [src/hooks/useStockfish.ts](src/hooks/useStockfish.ts#L195,L197,L201,L219,L226,L227), [app/game.tsx](app/game.tsx#L225,L226,L227)

Logging every Stockfish UCI line, WebView lifecycle event, and engine state change — several hundred log lines per session. Not gated behind `__DEV__`.

---

### 12. SQLite `opening_nodes` table has no indexes

**File:** [src/db/database.ts](src/db/database.ts#L40-L49)

The `opening_nodes` table is queried by `opening_id` and `parent_id` on every opening load. Neither column is indexed. On the current dataset (65 openings, ~800 nodes) this is fast. Any future growth makes queries progressively slower with no code change needed to fix it now:

```sql
CREATE INDEX IF NOT EXISTS idx_nodes_opening_id ON opening_nodes(opening_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id  ON opening_nodes(parent_id);
```

---

### 13. Two separate code paths for applying opponent opening moves

**File:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L187,L283)

Opponent moves during the opening phase are applied in two different places:
- `applyNextOpponentOpeningMove()` (line 187): called from `game.tsx` when the opponent moves first.
- `handleOpeningMove()` (line 283-289): applies the opponent's reply inline immediately after validating the player's move.

This dual-path is necessary given the opponent-first vs player-first opening structures, but it is not documented. It is also the root cause of the two-message inconsistency in issue #6.

---

### 14. `fetchEngineMove` mutates `chessRef` before React state is updated

**File:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L160-L165,L177)

Both the pre-computed and live paths inside `fetchEngineMove` call `chessRef.current.move(...)` directly. If the subsequent `setState` in `requestEngineMove` is not called (e.g., due to an exception), `chessRef` will be one move ahead of `state.lastValidFen`. This creates a silent divergence between the chess.js board state and React state.

---

### 15. Opening SAN moves are never validated

**File:** [src/data/openings.ts](src/data/openings.ts)

65+ openings are hardcoded SAN arrays. No code ever runs them through `chess.js` to verify the moves are legal in sequence. A typo would only surface at runtime when a player selects that opening, causing a silent failure in the opening phase.

---

### 16. Rating scale on the game-over screen is arbitrary placeholder

**File:** [app/game-over.tsx](app/game-over.tsx#L11-L16)

```typescript
if (moves >= 30) return { label: 'Grandmaster', color: '#ffd700' };
if (moves >= 20) return { label: 'Expert',      color: '#c0c0c0' };
```

Thresholds were never designed. 30 correct moves in the Ruy López (17-move opening + free play) is very different from 30 moves in Free Mode. Confirmed as not the project owner's intent. Needs replacement when a meaningful scoring system is designed.

---

### 17. `ArrowLayer` is a rendered but non-functional stub

**File:** [src/components/ChessBoard/ArrowLayer.tsx](src/components/ChessBoard/ArrowLayer.tsx), [src/components/ChessBoard/index.tsx](src/components/ChessBoard/index.tsx#L329)

Always receives an empty array and renders nothing. Dead code in the component tree. Either implement it or remove it.

---

## LOW — Minor code quality issues

### 18. `promotion as any` cast in three places

**File:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L235,L265,L371)

`promotion: promotion as any` suppresses a type mismatch between the `string | undefined` parameter and chess.js's expected `'q' | 'r' | 'b' | 'n'`. Should be narrowed properly.

---

### 19. Seven ESLint suppressions with no explanatory comment

**Files:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L430,L436,L462,L498), [app/game.tsx](app/game.tsx#L137,L146,L164)

Seven `// eslint-disable-next-line react-hooks/exhaustive-deps` with no comment explaining why the exhaustive array would be wrong. Each one is a trap for future developers.

---

### 20. Game-over description text is factually wrong for non-miss endings

**File:** [app/game-over.tsx](app/game-over.tsx#L41-L43)

`"You played ${moves} best moves in a row before missing twice."` — shown even when the game ends by checkmate or draw. Will be resolved as part of issue #5.

---

### 21. `getTopMove` is exported but never called

**File:** [src/hooks/useStockfish.ts](src/hooks/useStockfish.ts#L323-L330)

Runs a full separate `analyse()` with `multiPV=1`. Exposed in the hook interface but not used anywhere in the codebase. Either remove it or document when it should be preferred over `getBestMove`.

---

## Additional bugs found in deep read

The following issues were found by reading every file line by line, including the board internals, database layer, and setup flow. None are covered by the existing audit items above.

---

### 22. Timeout promise leaks an unhandled rejection on every successful Stockfish query

**File:** [src/hooks/useStockfish.ts](src/hooks/useStockfish.ts#L289-L310)  
**Severity:** Critical — fires silently on every normal analysis call

```typescript
const timeoutPromise = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('Engine timeout')), ANALYSIS_TIMEOUT_MS),
);
return Promise.race([analysisPromise, timeoutPromise]).catch(err => { ... });
```

When the analysis resolves normally (well within 8 seconds), `Promise.race` resolves with the result. The `timeoutPromise` is still pending — nothing is awaiting it, and its `reject` handle is held alive by the `setTimeout` closure. Eight seconds later the `setTimeout` fires, calls `reject(new Error('Engine timeout'))` on a Promise with no handler, and produces an unhandled promise rejection. This happens on every successful analysis call — several times per game session.

On Android, unhandled rejections in the React Native JS thread trigger a yellow warning in development and can crash the app in production if the global `onunhandledrejection` handler is configured to throw.

**Fix:** Clear the timeout when the analysis resolves:
```typescript
let timeoutId: ReturnType<typeof setTimeout>;
const timeoutPromise = new Promise<never>((_, reject) => {
  timeoutId = setTimeout(() => reject(new Error('Engine timeout')), ANALYSIS_TIMEOUT_MS);
});
return Promise.race([analysisPromise, timeoutPromise])
  .then(result => { clearTimeout(timeoutId); return result; })
  .catch(err => { clearTimeout(timeoutId); /* existing handler */ throw err; });
```

---

### 23. Opening phase permanently freezes if any opponent move in the theory line is invalid

**Files:** [src/hooks/useChessGame.ts](src/hooks/useChessGame.ts#L283-L308), [app/game.tsx](app/game.tsx#L150-L165)  
**Severity:** Critical — game is unrecoverable without a restart

When the player plays a correct opening move, `handleOpeningMove` applies the player's move to `chessRef.current` and then immediately tries to apply the opponent's reply (line 283-289). If that reply fails (e.g., typo in `openings.ts`), `opponentMove` is null, and `nextIndex` stays at the opponent's move index. State is updated with `openingMoveIndex: nextIndex` and `phase: 'OPENING_PHASE'`.

`isOpponentOpeningTurn` is then `true`. The `useEffect` in `game.tsx` fires `playOpponentOpeningMove()` with a 400ms delay, which calls `applyNextOpponentOpeningMove()`. That function tries the same failing SAN on the same position — fails again, returns null. `game.tsx` does nothing. Crucially, **the dependencies of the effect did not change** (`isOpponentOpeningTurn` is still true, `state.openingMoveIndex` didn't change), so the effect **never re-fires**. The app is frozen in a state where it's the opponent's turn but the opponent cannot move, and there is no way for the player to proceed.

This is not hypothetical: the opening data in `openings.ts` has no validation (audit issue #15), so a single typo anywhere in 65 openings triggers this permanently for anyone who selects that opening.

**Fix (immediate):** In `applyNextOpponentOpeningMove`, if the move fails, transition to `GAME_OVER` with an error reason rather than returning null silently. **Fix (root):** Add opening SAN validation (plan item 3.2) so this state is impossible at runtime.

---

### 24. Stockfish error overlay traps the player with no way to recover

**File:** [app/game.tsx](app/game.tsx#L289-L293)  
**Severity:** High — player cannot leave or retry without killing the app

```typescript
{isError && (
  <View style={styles.engineOverlay}>
    <Text style={styles.engineErrorText}>⚠ {errorMessage}</Text>
  </View>
)}
```

The error overlay fills the screen with a message and nothing else. The message says "Please restart the app" but there is no button to restart, retry, or even navigate back. The back chip at the top of the screen is covered by the overlay (`zIndex: 999`). The player's only option is to use Android's system back gesture or kill the app.

**Fix:** Add a "Go back" button to the error overlay that calls `router.back()`.

---

### 25. Error boundary "Try again" does not remount child components

**File:** [app/_layout.tsx](app/_layout.tsx#L32-L37)  
**Severity:** High — recovery attempt silently fails

```typescript
onPress={() => this.setState({ hasError: false, message: '' })}
```

Clearing the boundary's error state causes it to re-render its children — but React reuses the existing component instances. The hooks inside those components (`useChessGame`, `useStockfish`) retain whatever corrupted state caused the crash. The next render is very likely to throw the same error again, returning the user to the same error screen immediately.

A proper recovery must force-remount the subtree. The standard pattern:
```typescript
// In state: errorKey: number
// In render: <div key={this.state.errorKey}>{children}</div>
// On retry: this.setState(s => ({ hasError: false, errorKey: s.errorKey + 1 }))
```

---

### 26. Premove can be queued during the opening phase transition window

**Files:** [src/components/ChessBoard/Piece.tsx](src/components/ChessBoard/Piece.tsx#L113-L135), [app/game.tsx](app/game.tsx#L100-L125)  
**Severity:** High — causes a stale premove to execute at the wrong moment in the game phase

The gesture handler in `Piece.tsx` decides tap vs premove based on `turnSV.value === playerColor` (a Reanimated shared value, read on the UI thread). After the player's opening move is accepted:

1. `commitMove` finishes its animation → sets `turnSV.value` to the **opponent's** color and `isAnimatingSV.value = false`
2. `onMove` callback fires → `handleMove` starts → `onPlayerMoveRef.current(...)` runs (async)
3. `handleMove` returns `result.engineMove` for the opponent's reply → `setIsAnimating(true)` → `boardRef.current?.move(opponent)` starts → `isAnimatingSV.value = true`

Between steps 1 and 3, there is a brief window where `isAnimatingSV.value = false` (gestures enabled) and `turnSV.value = opponent_color` (player's gesture is treated as a premove). If the player taps a piece during this window, `onPremoveTap` is called and `premoveRef.current` is set in `game.tsx`. This premove is then executed by `playEngineMove` the next time the engine moves — in the **game phase**, where it is completely out of context.

**Fix:** Clear `premoveRef.current` at the start of every opening-phase move resolution in `game.tsx`.

---

### 27. `getByCategory` uses N+1 sequential DB queries to load opening moves

**File:** [src/db/openings.ts](src/db/openings.ts#L86-L93)  
**Severity:** Medium — slow opening selector, proportionally worse as library grows

```typescript
const rows = await db.getAllAsync<OpeningRow>(sql, params);
for (const row of rows) {
  const moves = await _getMainLineMoves(db, row.id);  // separate query per opening
  result.push(rowToOpening(row, moves));
}
```

For 65 openings in a category, this runs 66 sequential queries: one for the opening list, then one per opening for its nodes. Each node query scans the entire `opening_nodes` table without indexes (also audit issue #12). On first load this blocks the UI until all 66 queries complete.

**Fix:** Fetch all nodes for the relevant openings in a single query using an `IN` clause, then build all move lists in memory:
```typescript
const ids = rows.map(r => `'${r.id}'`).join(',');
const nodes = await db.getAllAsync<NodeRow>(
  `SELECT * FROM opening_nodes WHERE opening_id IN (${ids}) ORDER BY opening_id, ply, id`
);
// group nodes by opening_id in JS, then build each move list
```

---

### 28. Castling rook animation can be cut short by a React state update

**Files:** [src/components/ChessBoard/index.tsx](src/components/ChessBoard/index.tsx#L235-L244), [src/components/ChessBoard/Piece.tsx](src/components/ChessBoard/Piece.tsx#L56-L62)  
**Severity:** Medium — visual glitch during castling

In the imperative `move()` API (used for engine/opening moves):

```typescript
const castling = detectCastling(boardLogic, from, to);
await piecesRef.current?.animatePiece({ from, to });   // King — awaited
if (castling) {
  piecesRef.current?.animatePiece({ from: castling.rookFrom, to: castling.rookTo });  // Rook — fire-and-forget
}
const result = boardLogic.executeMove({ from, to, promotion: promotion ?? 'q' });
// executeMove calls syncState() which calls setPieces() → triggers re-render
```

The rook animation starts fire-and-forget, then `executeMove` runs immediately and calls `syncState()` → `setPieces()`. React re-renders `Pieces`, and the rook's `piece.square` changes from `castling.rookFrom` to `castling.rookTo`. The rook `Piece` component receives the new square, and its `useEffect`:

```typescript
useEffect(() => {
  translateX.value = 0;  // cancels animation
  translateY.value = 0;
}, [piece.square]);
```

…resets the translate offset to zero, which snaps the rook to its final position and interrupts the in-progress animation. Whether this is noticeable depends on how much of the rook animation has completed before the state update flushes. Under normal device load the king and rook animations are both 200ms and start at the same time, so the rook should be close to finished by the time the state updates. Under heavy load the rook can visibly snap.

The same issue applies in `commitMove` (player castling) where the rook animation is also fire-and-forget.

---

### 29. `seedOpenings` has a race condition that crashes the opening selector in React StrictMode

**File:** [src/db/seed.ts](src/db/seed.ts#L10-L14)  
**Severity:** Medium — "Failed to load openings" on every dev launch in strict mode

```typescript
const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM openings');
if ((row?.count ?? 0) > 0) return;

await db.withTransactionAsync(async () => { ... });
```

React 18+ StrictMode double-invokes effects. Both invocations of `useOpenings` call `seedOpenings()` simultaneously. Both read `count = 0`, both pass the guard, and both enter the transaction. The second transaction fails on the `PRIMARY KEY` constraint for `opening.id`, throws an error, and `useOpenings` catches it and sets `error: 'Failed to load openings'`.

**Fix:** Wrap the check-and-seed in a `BEGIN EXCLUSIVE` transaction, or use a module-level in-progress lock:
```typescript
let seedPromise: Promise<void> | null = null;
export function seedOpenings(): Promise<void> {
  if (!seedPromise) seedPromise = _doSeed();
  return seedPromise;
}
```

---

### 30. `PIECE_LABEL` renders letter abbreviations, not chess symbols — issue #7 is understated

**File:** [src/components/ChessBoard/constants.ts](src/components/ChessBoard/constants.ts#L21-L28), [src/components/ChessBoard/Piece.tsx](src/components/ChessBoard/Piece.tsx#L178)  
**Severity:** Medium — worse than described in audit issue #7

Audit issue #7 describes pieces as "Unicode chess symbols." They are not — they are plain ASCII letters (`P`, `N`, `B`, `R`, `Q`, `K`) on a solid-color square. White and black pieces of the same type are visually distinguished only by the background color of their bounding box (light vs dark). At small board sizes it is genuinely difficult to tell piece types apart at a glance.

Additionally, `PIECE_COLOR` (defined in the same constants file) is imported in `Piece.tsx` but never used — the piece background color is hardcoded inline as `'#f5f0e8'` / `'#2a1a0e'`.

---

### 31. `TAP_MAX_DISTANCE` is imported and exported but never applied

**File:** [src/components/ChessBoard/constants.ts](src/components/ChessBoard/constants.ts#L38), [src/components/ChessBoard/Piece.tsx](src/components/ChessBoard/Piece.tsx#L24)  
**Severity:** Low — dead constant, gesture tap detection is undefined

`TAP_MAX_DISTANCE = 20` is imported in `Piece.tsx` but used nowhere. The `Gesture.Pan()` handler has no `.minDistance()` configured, so the system default activates the gesture on any movement. If the intended design was that a drag shorter than 20px should be treated as a tap, that constraint is not applied. On some devices, small unintentional finger movement during a tap could be treated as a drag, silently dropping the tap event.

---

## Summary table

| # | Severity | Issue | File |
|---|----------|-------|------|
| 1 | Critical | `computeAcceptable` wrong — hardcoded top-3, no proximity threshold | useChessGame.ts:55 |
| 2 | Critical | Engine live fallback uses unfiltered top-10 — can play bad moves | useChessGame.ts:174 |
| 3 | Critical | Prefetch pre-computes engine replies (low urgency) not eligible set (high urgency) | useChessGame.ts:111 |
| 4 | Critical | Free Mode theory move acceptance entirely missing | useChessGame.ts:314 |
| 22 | Critical | Timeout promise leaks unhandled rejection on every successful analysis | useStockfish.ts:289 |
| 23 | Critical | Opening phase permanently freezes if any opponent move is invalid | useChessGame.ts:283, game.tsx:150 |
| 5 | High | Three game-over conditions all show identical screen | game.tsx:84, game-over.tsx |
| 6 | High | "Opening complete" has two different messages from two code paths | useChessGame.ts:214,277 |
| 7 | High | Pieces render as plain letters — visually unclear, inconsistent across devices | Piece.tsx:178 |
| 8 | High | Local stats not implemented | — |
| 9 | High | Zustand store never cleared after game over | gameStore.ts |
| 24 | High | Stockfish error overlay has no recovery action — player is trapped | game.tsx:289 |
| 25 | High | Error boundary "Try again" reuses broken component state instead of remounting | _layout.tsx:32 |
| 26 | High | Premove can be queued during opening phase transition, executes in wrong phase | Piece.tsx:113, game.tsx:100 |
| 10 | Medium | Tailwind/NativeWind installed and unused | babel.config.js |
| 11 | Medium | `console.log` throughout production code | useStockfish.ts, game.tsx |
| 12 | Medium | No indexes on `opening_nodes` table | database.ts |
| 13 | Medium | Two code paths for opponent opening moves — undocumented | useChessGame.ts:187,283 |
| 14 | Medium | `fetchEngineMove` mutates `chessRef` before React state update | useChessGame.ts:177 |
| 15 | Medium | Opening SAN moves never validated — typos caught only at runtime | data/openings.ts |
| 16 | Medium | Rating scale is arbitrary placeholder | game-over.tsx:11 |
| 17 | Medium | `ArrowLayer` rendered but always empty — dead code | ArrowLayer.tsx |
| 27 | Medium | `getByCategory` uses N+1 sequential queries — 66 queries to load one category | db/openings.ts:87 |
| 28 | Medium | Castling rook animation interrupted by React state update | ChessBoard/index.tsx:235 |
| 29 | Medium | `seedOpenings` race condition crashes opening selector in React StrictMode | db/seed.ts:10 |
| 30 | Medium | `PIECE_LABEL` uses plain letters not symbols — issue #7 is understated | constants.ts:21 |
| 18 | Low | `promotion as any` in three places | useChessGame.ts:235,265,371 |
| 19 | Low | 7 ESLint suppressions without explanation | useChessGame.ts, game.tsx |
| 20 | Low | Game-over description wrong for non-miss endings | game-over.tsx:41 |
| 21 | Low | `getTopMove` exported but never called | useStockfish.ts:323 |
| 31 | Low | `TAP_MAX_DISTANCE` and `PIECE_COLOR` imported but never used | constants.ts:38, Piece.tsx:24 |
