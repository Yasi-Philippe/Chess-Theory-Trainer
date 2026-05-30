# Chess Theory Trainer — Plan of Action (dev branch)

**Based on:** DESIGN.md (intended behavior) and AUDIT.md (dev branch findings)  
**Goal:** Bring the project to a fully correct, shippable state on Android

---

## Guiding principles

- **Fix before refactor.** The app must be correct before it is clean.
- **Algorithm first.** The eligibility algorithm is the heart of the app. Everything that touches move validation — player validation, engine selection, prefetch — is wrong until the algorithm is right. Fix it all in one pass.
- **Rewrite where scope has changed enough that patching costs more than replacing.** The algorithm block in `useChessGame.ts` qualifies. The rest is targeted fixes.
- **Each phase leaves the app in a working, playable state.** No phase introduces an unresolved regression.

---

## The efficiency principle (informs all algorithm work)

The player needs to know if their move is valid the instant they touch a piece. The engine's reply can wait — that is what the thinking banner is for.

**Correct computation order:**
1. Engine makes its move → immediately start computing `eligible_set(new_fen)` in the background
2. Player makes a move → check against the cached eligible set (instant if ready; live fallback if not)
3. Move accepted → engine computes its reply live (thinking indicator shown), picks from `eligible_set(engine_fen)` weighted by win probability
4. Engine replies → immediately start computing `eligible_set(next_fen)` for the player
5. Repeat

This replaces the current prefetch which pre-computes engine replies (up to 3 extra Stockfish analyses per turn) instead of the eligible set (1 analysis, the one that matters for instant feedback).

---

## Phase 0 — Dependency cleanup and safety fixes

*Do this first. Costs almost nothing, reduces noise in all future work. The safety fixes here (0.4, 0.5) protect against crashes that can happen at any point during development.*

### 0.1 — Remove Tailwind / NativeWind
Uninstall `tailwindcss` and `nativewind`. Delete `tailwind.config.js`. Remove the NativeWind Babel plugin from `babel.config.js`. Every Metro build is faster after this.

### 0.2 — Remove `ArrowLayer`
Delete `src/components/ChessBoard/ArrowLayer.tsx`. Remove its import and the `<ArrowLayer arrows={[]} />` render from `ChessBoard/index.tsx:329`. It is a stub that renders nothing.

### 0.3 — Remove `getTopMove`, `PIECE_COLOR`, and `TAP_MAX_DISTANCE`
Delete `getTopMove` from `useStockfish.ts` and its return type — never called. Remove `PIECE_COLOR` and `TAP_MAX_DISTANCE` from `ChessBoard/constants.ts` and their imports in `Piece.tsx` — defined and imported but never used.

### 0.4 — Fix error boundary: force-remount children on "Try again"

**Audit #25.** The current "Try again" button clears error state but reuses the same component instances, which retain the corrupted state that caused the crash. Add a `errorKey` counter to the boundary state and apply it as a `key` prop to the children wrapper, forcing a full remount:

```typescript
// state: { hasError: boolean; message: string; errorKey: number }
// on retry: setState(s => ({ hasError: false, message: '', errorKey: s.errorKey + 1 }))
// in render: <React.Fragment key={this.state.errorKey}>{children}</React.Fragment>
```

### 0.5 — Fix `seedOpenings` race condition

**Audit #29.** React StrictMode double-invokes effects, causing two simultaneous `seedOpenings()` calls. Both pass the `count === 0` guard and both attempt insertion; the second fails with a PRIMARY KEY constraint and `useOpenings` shows "Failed to load openings."

Use a module-level in-progress lock so concurrent calls share the same Promise:

```typescript
let _seedPromise: Promise<void> | null = null;
export function seedOpenings(): Promise<void> {
  if (!_seedPromise) _seedPromise = _doSeed();
  return _seedPromise;
}
```

---

## Phase 1 — Core algorithm rewrite

*The most important phase. Issues #1, #2, #3, and #4 from the audit are all fixed here.*

### 1.1 — Fix timeout Promise leak in `analyse()`

**Audit #22.** Every successful Stockfish query leaks an unhandled promise rejection 8 seconds later. The `timeoutPromise` created by `Promise.race` is never resolved or cancelled when the analysis finishes first. Its `setTimeout` fires 8 seconds later, calls `reject()` on a Promise with no handler, and produces an unhandled rejection.

Clear the timeout on both the success and failure paths:

```typescript
let timeoutId: ReturnType<typeof setTimeout>;
const timeoutPromise = new Promise<never>((_, reject) => {
  timeoutId = setTimeout(() => reject(new Error('Engine timeout')), ANALYSIS_TIMEOUT_MS);
});
return Promise.race([analysisPromise, timeoutPromise])
  .then(result => { clearTimeout(timeoutId); return result; })
  .catch(err => { clearTimeout(timeoutId); /* existing error handler */; throw err; });
```

### 1.2 — Implement `getEligibleSet` in `useStockfish.ts`

Replace the `getBestMove` / `getTopMove` pair with a single function:

```typescript
getEligibleSet(fen: string): Promise<StockfishMove[]>
```

This function runs `analyse(fen, MULTI_PV=10)` and applies filters in order:

1. Take all candidates from the analysis (up to 10).
2. If `winProb(best) > 0.50`: discard any candidate where `winProb(m) < 0.50`.
3. Discard any candidate where `winProb(m) < winProb(best) × 0.90`.
4. Return the remaining set (1–10 moves, varies by position).

`weightedRandomMove` stays as-is — it will now always receive a pre-filtered set.

**Important:** `getEligibleSet` is used for *both* player validation and engine move selection. The same set. If a move is good enough for the engine to play, it is good enough for the player to play.

### 1.3 — Delete `computeAcceptable`, wire `getEligibleSet` everywhere

Delete `computeAcceptable` from `useChessGame.ts`. All call sites replace it with `getEligibleSet`.

In `handleGameMove`:
- If cache has the eligible set for this FEN: use it (instant)
- Otherwise: call `getEligibleSet(fen)` live (with thinking indicator)

In `fetchEngineMove` (engine reply):
- Call `getEligibleSet(fen)` for the engine's position
- Apply `weightedRandomMove` to the filtered result
- The engine now always plays a good move

### 1.4 — Rewrite the prefetch system

Replace the current two-step prefetch (eligible set + engine replies) with a single-step prefetch (eligible set only):

```
After engine moves:
  → prefetchRef = { forFen, eligibleSet: await getEligibleSet(newFen) }

When player moves:
  → if prefetchRef.forFen === fen: use cached eligibleSet (instant)
  → else: call getEligibleSet(fen) live
  → always compute engine reply live after the move is validated
```

Cache structure simplifies to:
```typescript
prefetchRef: { forFen: string; eligibleSet: StockfishMove[] } | null
```

Cancellation: use a generation counter ref (`prefetchGenRef`). Increment on each new prefetch. The async function checks if its generation is still current before writing to the cache.

**Fix or rewrite:** Rewrite the ~80-line prefetch block. The logic changes enough that patching is slower.

### 1.5 — Add Free Mode theory move acceptance

In `handleGameMove`, add a second acceptance check that only activates when `mode === 'free'`:

```typescript
if (!isAccepted && mode === 'free') {
  isAccepted = isTheoryMove(currentFen, playedUci);
}
```

`isTheoryMove(fen, uci)`: for the current FEN, find all openings where the board position matches some prefix of the opening's moves, then check if `playedUci` is the next move in any of those openings. The existing SQLite opening DB already holds all the data needed.

---

## Phase 2 — Game completeness

*Algorithm is now correct. Fill in the missing game loop pieces.*

### 2.1 — Unify the two "opening complete" messages

Define one constant in `useChessGame.ts`:
```typescript
const MSG_OPENING_COMPLETE = 'Opening complete! Now find the best moves.';
```
Replace both occurrences at lines 214 and 277 with this constant.

### 2.2 — Add distinct game-over endings (miss / checkmate / draw)

**In `useChessGame.ts`:** After player or engine moves, distinguish:
- `chess.isCheckmate()` → `gameOverReason: 'checkmate'`
- `chess.isDraw()` → `gameOverReason: 'draw'`
- Two consecutive misses → `gameOverReason: 'two_misses'`

Add `gameOverReason` to `GameState` and set it on transition to `GAME_OVER`.

**In `game.tsx`:** Pass `gameOverReason` as a route parameter alongside `score`.

**In `game-over.tsx`:** Read `reason` from `useLocalSearchParams`. Render three different result cards with appropriate text. Fix the description text (audit issue #20) as part of this task.

### 2.3 — Fix `fetchEngineMove` chess state mutation

Return the chosen move UCI from `fetchEngineMove` without applying it to `chessRef`. Apply it in `requestEngineMove` just before `setState`. This eliminates the divergence window between chess.js state and React state.

### 2.4 — Fix opening phase permanent freeze on invalid move

**Audit #23.** If any opponent move in the theory line is invalid (SAN typo in `openings.ts`), `applyNextOpponentOpeningMove` returns null and `isOpponentOpeningTurn` stays true. The driving effect in `game.tsx` never re-fires because its dependencies don't change. The game is permanently stuck.

In `applyNextOpponentOpeningMove`, replace the silent `return null` on move failure with a state transition to `GAME_OVER` with a new reason `'data_error'`. In `game-over.tsx`, show a brief "Opening data error" message for this case. This is a rare path but must not leave the app in a dead state.

Once the opening validation script (3.2) is in place this can never happen in production, but the defensive fallback must exist.

### 2.5 — Clear premove ref at the start of each opening move resolution

**Audit #26.** Between `commitMove` finishing (sets `turnSV` to opponent color) and the opponent's animation starting (sets `isAnimatingSV = true`), there is a window where the player can accidentally queue a premove. That premove is stored in `premoveRef.current` and executes in the game phase.

In `handleMove` (game.tsx), at the top of the function — before calling `onPlayerMoveRef.current` — clear `premoveRef.current` if the current phase is `OPENING_PHASE`:

```typescript
if (stateRef.current.phase === 'OPENING_PHASE') {
  premoveRef.current = null;
}
```

### 2.6 — Fix castling rook animation interrupted by state update

**Audit #28.** The rook's fire-and-forget animation races against `boardLogic.executeMove` → `syncState()` → `setPieces()`. When `pieces` re-renders, the rook's `piece.square` changes and its `useEffect` resets `translateX/Y = 0`, cutting the animation short.

In `commitMove` and the imperative `move()`, await the rook animation alongside the king animation using `Promise.all` instead of fire-and-forget:

```typescript
// Before:
piecesRef.current?.animatePiece({ from: castling.rookFrom, to: castling.rookTo }); // fire-and-forget
await piecesRef.current?.animatePiece({ from, to }); // king only
boardLogic.executeMove(...);

// After:
await Promise.all([
  piecesRef.current?.animatePiece({ from, to }),
  piecesRef.current?.animatePiece({ from: castling.rookFrom, to: castling.rookTo }),
]);
boardLogic.executeMove(...);
```

This ensures both animations complete before the state update fires.

---

## Phase 3 — Data and persistence

### 3.1 — Add indexes to `opening_nodes`

Add to the next migration in `database.ts`:

```sql
CREATE INDEX IF NOT EXISTS idx_nodes_opening_id ON opening_nodes(opening_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id  ON opening_nodes(parent_id);
```

### 3.2 — Opening SAN validation script

Create `scripts/validate-openings.ts` — a small Node script that runs every opening through `chess.js` move-by-move and fails on any illegal move. Run manually before adding new openings. This is ~20 lines and catches data typos permanently.

### 3.3 — Implement local stats

**New SQLite table** (migration v2 or v3):
```sql
CREATE TABLE IF NOT EXISTS opening_stats (
  opening_id   TEXT    PRIMARY KEY REFERENCES openings(id),
  best_score   INTEGER NOT NULL DEFAULT 0,
  total_games  INTEGER NOT NULL DEFAULT 0
);
```

**Write:** On game over, read current stats for `openingId`, increment `total_games`, update `best_score` if the new score is higher. Free Mode (no opening): skip stats.

**Read:** In `OpeningSelector.tsx`, show best score and games played next to each opening card where stats exist.

**New best indicator:** On the game-over screen, if new score > previous best, show a "New best!" highlight.

### 3.4 — Clear Zustand store after game over

In `game-over.tsx`, call `useGameStore.getState().clearSetup()` on mount. Two lines.

Longer term: replace the Zustand store with Expo Router route params (`openingId`, `color`, `mode` as params; resolve the opening from SQLite in `game.tsx`). Do this after stats are implemented since both touch the opening data flow — combining them into one change is cleaner.

### 3.5 — Fix N+1 query pattern in `getByCategory`

**Audit #27.** Loading one category of openings fires 66 sequential queries: 1 for the opening list, then 1 per opening for its nodes. With no indexes this is slow today and gets worse as the library grows.

Fetch all nodes for the matched openings in a single query:

```typescript
const rows = await db.getAllAsync<OpeningRow>(sql, params);
if (rows.length === 0) return [];

const ids = rows.map(r => `'${r.id}'`).join(',');
const nodes = await db.getAllAsync<NodeRow>(
  `SELECT * FROM opening_nodes WHERE opening_id IN (${ids}) ORDER BY opening_id, ply, id`
);

// Group nodes by opening_id in memory, build each move list without further queries
const nodesByOpening = new Map<string, NodeRow[]>();
for (const node of nodes) {
  if (!nodesByOpening.has(node.opening_id)) nodesByOpening.set(node.opening_id, []);
  nodesByOpening.get(node.opening_id)!.push(node);
}

return rows.map(row => {
  const openingNodes = nodesByOpening.get(row.id) ?? [];
  const moves = nodesToMoves(buildMainLine(openingNodes));
  return rowToOpening(row, moves);
});
```

This collapses 66 queries into 2, regardless of how many openings are in the category. Do this task together with 3.1 (indexes) in the same commit.

---

## Phase 4 — Visual quality

### 4.1 — Replace Unicode pieces with SVG pieces

Install `react-native-svg`. Source a freely licensed SVG piece set (Lichess's cburnett set is CC BY-SA 3.0). Store 12 SVG files in `assets/pieces/`. Replace the `<Text>` render in `Piece.tsx:178` with an SVG component.

Benefits: consistent rendering across all Android versions, proper transparency, professional appearance.

---

## Phase 5 — Code quality cleanup

*Mechanical fixes. Do as a single cleanup pass.*

### 5.1 — Remove `console.log` from production code
Gate all logging in `useStockfish.ts` and `game.tsx` behind `if (__DEV__)` or remove entirely.

### 5.2 — Fix `promotion as any` casts
Narrow `promotion` to `'q' | 'r' | 'b' | 'n' | undefined` at the function boundary in `useChessGame.ts` (lines 235, 265, 371).

### 5.3 — Add explanatory comments to ESLint suppressions
For each of the 7 `eslint-disable-next-line react-hooks/exhaustive-deps`, add a one-line comment explaining why the exhaustive array would be wrong.

### 5.4 — Fix or remove the rating scale
Replace the arbitrary Grandmaster/Expert thresholds in `game-over.tsx` with a `TODO` comment or remove the label entirely until a proper scoring model is designed. Do not ship wrong labels.

### 5.5 — Add recovery action to the Stockfish error overlay

**Audit #24.** The error overlay covers the entire screen including the back button, with no way for the player to navigate away or retry. Add a "Go back" button:

```typescript
{isError && (
  <View style={styles.engineOverlay}>
    <Text style={styles.engineErrorText}>⚠ {errorMessage}</Text>
    <TouchableOpacity onPress={() => router.back()} style={styles.errorButton}>
      <Text style={styles.errorButtonText}>Go back</Text>
    </TouchableOpacity>
  </View>
)}

---

## Phase 6 — Tests

*Add tests incrementally as each phase completes.*

### 6.1 — Algorithm unit tests (after Phase 1)
Test `getEligibleSet` filter logic with mocked Stockfish responses. Cover: all moves winning, all losing, mixed winning/losing, at-threshold, below-threshold.

### 6.2 — Opening validation (after Phase 3)
Run `scripts/validate-openings.ts` as a Jest test or CI step.

### 6.3 — Game logic unit tests (after Phase 2)
- Opening phase: correct/wrong move behavior, last move fires completion event.
- Game phase: miss counter resets on correct move, second consecutive miss triggers game over.

### 6.4 — Stockfish bridge tests (after Phase 1)
- Parse correctness for `info depth … multipv … score cp … wdl … pv` lines.
- 8-second timeout fires when no `bestmove` received.
- Cancellation: new analysis before first resolves rejects the first.

---

## Summary — ordered task list

| Phase | Task | Audit # | Type | Effort |
|-------|------|---------|------|--------|
| 0.1 | Remove Tailwind/NativeWind | #10 | Delete | XS |
| 0.2 | Remove `ArrowLayer` stub | #17 | Delete | XS |
| 0.3 | Remove unused `getTopMove`, `PIECE_COLOR`, `TAP_MAX_DISTANCE` | #21, #31 | Delete | XS |
| 0.4 | Fix error boundary — force-remount on "Try again" | #25 | Fix | XS |
| 0.5 | Fix `seedOpenings` race condition | #29 | Fix | XS |
| 1.1 | Fix timeout Promise leak in `analyse()` | #22 | Fix | XS |
| 1.2 | Implement `getEligibleSet` in useStockfish | #1, #2 | Rewrite | S |
| 1.3 | Delete `computeAcceptable`, wire `getEligibleSet` everywhere | #1, #2 | Rewrite | S |
| 1.4 | Rewrite prefetch — eligible set only, correct cancellation | #3 | Rewrite | M |
| 1.5 | Free Mode theory move acceptance | #4 | New | M |
| 2.1 | Unify the two "opening complete" messages | #6 | Fix | XS |
| 2.2 | Distinct game-over endings — miss / checkmate / draw | #5 | New | S |
| 2.3 | Fix `fetchEngineMove` chess state mutation | #14 | Fix | S |
| 2.4 | Fix opening phase permanent freeze on invalid move | #23 | Fix | S |
| 2.5 | Clear premove during opening phase transition | #26 | Fix | XS |
| 2.6 | Fix castling rook animation race | #28 | Fix | S |
| 3.1 | Add indexes to `opening_nodes` | #12 | Fix | XS |
| 3.2 | Opening SAN validation script | #15 | New | XS |
| 3.3 | Local stats — table, write on game over, read in selector | #8 | New | M |
| 3.4 | Clear Zustand store after game over | #9 | Fix | XS |
| 3.5 | Fix N+1 queries in `getByCategory` | #27 | Fix | S |
| 4.1 | SVG piece rendering | #7, #30 | New | M |
| 5.1 | Remove `console.log` from production | #11 | Fix | XS |
| 5.2 | Fix `promotion as any` casts | #18 | Fix | XS |
| 5.3 | Add ESLint suppression comments | #19 | Fix | XS |
| 5.4 | Fix or remove rating scale | #16 | Fix | XS |
| 5.5 | Add recovery action to error overlay | #24 | Fix | XS |
| 6.1 | Algorithm unit tests | — | Tests | S |
| 6.2 | Opening validation test | — | Tests | XS |
| 6.3 | Game logic unit tests | — | Tests | M |
| 6.4 | Stockfish bridge tests | — | Tests | S |

**Effort key:** XS = under an hour, S = half a day, M = full day  
**Audit # column** references the issue number in AUDIT.md for traceability.
