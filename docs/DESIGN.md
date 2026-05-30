# Chess Theory Trainer — Design Document

## What is this?

A mobile chess training app for Android. The goal is to teach players opening theory through repetition — learning by doing, not by reading. Instead of memorizing moves from a book, the player sits across from Stockfish and figures out the right moves by trial and error. All players are welcome, from beginners learning their first opening to advanced players drilling specific lines.

There is no online component. Everything runs locally on the device.

---

## Modes

### Theory Mode
The player selects a specific opening (e.g. Ruy López, Sicilian Najdorf) and a color (White or Black). The session has two phases:

**Phase 1 — Opening Phase**  
The player must reproduce the theory line exactly, move by move. There is no room for alternatives here — the exact moves of the chosen opening must be played in order. Stockfish plays the opponent's side of the theory line automatically.

When the player successfully plays every move in the theory line, a notification appears confirming it: *"You have completed the opening theory line."* The session then moves into Phase 2.

**Phase 2 — Game Phase**  
The opening is over but the game continues. From this point, the player must find the strongest moves available in the position. Stockfish continues playing as the opponent, now choosing from its own set of good moves (see Opponent Behavior below). The session lasts until the player makes two consecutive wrong moves or the game reaches a natural end (checkmate or draw).

---

### Free Mode
No opening is selected. The game starts from the initial position and the player finds the best moves from move 1. This mode is for players who want to practice positional decision-making without following a preset line.

**Move acceptance in Free Mode uses the same eligibility algorithm as the Game Phase** (see What Counts as a Correct Move below) — up to 10 moves, filtered by the proximity threshold and the winning/losing rule. The number of eligible moves will vary by position and will rarely be a fixed number.

In addition, **any recognized opening theory move is also accepted** in Free Mode. The idea is that if a player plays a known, principled opening move, the app should recognize it as valid — they are not punished for having opening knowledge.

This wider acceptance (theory moves as valid) only applies in Free Mode. Once the theory line ends in Theory Mode, only the eligible Stockfish moves are acceptable.

---

## The Miss System

The player has two chances per position, not per game.

- A wrong move costs one chance and the board reverts. The player tries again from the same position.
- A second consecutive wrong move in the same position ends the session immediately.
- A correct move fully resets the counter. In the next position, the player once again has two chances.

This means the game never punishes a single mistake — it punishes being stuck. A player who consistently gets it right on the second attempt will never lose.

---

## What Counts as a Correct Move

This depends on the phase:

| Phase | What is accepted |
|---|---|
| Theory Mode — Opening Phase | The exact move in the theory line. No alternatives. |
| Theory Mode — Game Phase | Any of Stockfish's top acceptable moves for that position. |
| Free Mode | Any of Stockfish's top acceptable moves, plus any recognized opening theory move. |

**"Acceptable moves"** are determined by the following algorithm, applied to Stockfish's top 10 candidates for the position:

1. **Start with the top 10 moves** from Stockfish's analysis.
2. **Remove losing moves when winning moves exist.** If the best move has a win probability above 50%, any move with a win probability below 50% is discarded. If all moves are below 50% (the position is losing), no move is discarded at this step.
3. **Apply the 10% proximity threshold.** Any move whose win probability is lower than 90% of the best move's win probability is discarded.
   - Example: best move = 65% → threshold = 58.5% → discard below 58.5%
   - Example: best move = 80% → threshold = 72% → discard below 72%
   - Example: best move = 55% → threshold = 49.5%, but step 2 already removed everything below 50%, so effective threshold is 50%
4. **What remains is the eligible set** — between 1 and 10 moves depending on the position. This set is used both to validate the player's move and to select the opponent's reply.

The number of eligible moves is not fixed. A sharp position might have only 1 or 2 eligible moves; a balanced, open position might have 8 or 9.

---

## Opponent Behavior

Stockfish does not always play the objectively best move. It picks randomly from the eligible move set (defined above), weighted by win probability — so the best move in the set is the most likely to be played, but any eligible move can occur. This means the player faces a realistic, principled opponent: it never plays a bad move, but it is not a perfect machine either.

The eligible set is the same set used to judge the player's moves, so there is full consistency: if a move is good enough for Stockfish to play, it is good enough for the player to play.

---

## Game Over Conditions

There are three ways a session ends:

1. **Two consecutive wrong moves** — The player ran out of chances in a position. The game over screen reflects this.
2. **Checkmate** — The game reached a definitive result. A different ending screen appears, distinct from the "ran out of chances" screen.
3. **Draw** — The game ended in stalemate, repetition, or another draw condition. A third ending state is shown.

---

## Scoring

The current score is the number of correct moves made during the session. This is shown at the end with a label (Grandmaster / Expert / etc.). **The scale and labels are placeholders and will be revised in a future iteration.**

---

## Local Stats

The app stores the following per opening, locally on the device:

- **Best score** — the highest move count reached in a session for that opening
- **Total games played** — how many sessions have been started for that opening

No account, no cloud sync, no online features.

---

## Platform

- **Current target:** Android
- **iOS:** Possible future addition, not in current scope
- **Web:** Not planned

---

## Opening Library

65+ openings are available, covering both White and Black repertoires. Each opening has a name, ECO code, a short description, and a move list in standard algebraic notation. Openings are searchable by name, ECO code, or description.
