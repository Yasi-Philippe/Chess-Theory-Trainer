// Shared game constants — single source of truth, referenced by hooks and UI.

/** Number of consecutive wrong moves before game over. */
export const MISS_LIMIT = 2;

/** Feedback messages and their display colors.
 *  Keys are exact strings emitted by useChessGame; values are hex colors. */
export const FEEDBACK_COLOR: Record<string, string> = {
  'Best move!':              '#22c55e',
  '2nd best move!':          '#86efac',
  '3rd best move!':          '#86efac',
  'Good move!':              '#86efac',
  'Opening complete! Find the best moves.':       '#22c55e',
  'Opening complete! Now find the best moves.':   '#22c55e',
  'Wrong move! One more chance.':                 '#ff9800',
  'Not the best move. One more chance!':          '#ff9800',
  'Game over!':              '#e94560',
  'Game complete!':          '#22c55e',
};

/** Fallback color for unknown feedback messages. */
export const FEEDBACK_COLOR_DEFAULT = '#8892a4';
