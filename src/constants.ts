// Shared game constants — single source of truth, referenced by hooks and UI.

/** Number of consecutive wrong moves before game over. */
export const MISS_LIMIT = 2;

/** The message shown when the opening theory line is fully played. */
export const MSG_OPENING_COMPLETE = 'Opening complete! Now find the best moves.';

/** Feedback messages and their display colors.
 *  Keys are exact strings emitted by useChessGame; values are hex colors. */
export const FEEDBACK_COLOR: Record<string, string> = {
  'Best move!':              '#22c55e',
  '2nd best move!':          '#86efac',
  '3rd best move!':          '#86efac',
  'Good move!':              '#86efac',
  [MSG_OPENING_COMPLETE]:    '#22c55e',
  'Wrong move! One more chance.':      '#ff9800',
  'Not the best move. One more chance!': '#ff9800',
  'Game over!':              '#e94560',
  'Checkmate!':              '#22c55e',
  'Draw!':                   '#8892a4',
};

/** Fallback color for unknown feedback messages. */
export const FEEDBACK_COLOR_DEFAULT = '#8892a4';
