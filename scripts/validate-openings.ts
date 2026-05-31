/**
 * Validates every opening in openings.ts by replaying its moves through chess.js.
 * Run before adding new openings: npx ts-node scripts/validate-openings.ts
 * Also run as a Jest test via the companion test file.
 */
import { Chess } from 'chess.js';
import { OPENINGS } from '../src/data/openings';

export function validateOpenings(): { id: string; move: string; ply: number }[] {
  const errors: { id: string; move: string; ply: number }[] = [];

  for (const opening of OPENINGS) {
    const chess = new Chess();
    for (let i = 0; i < opening.moves.length; i++) {
      try {
        const result = chess.move(opening.moves[i]);
        if (!result) {
          errors.push({ id: opening.id, move: opening.moves[i], ply: i + 1 });
          break;
        }
      } catch {
        errors.push({ id: opening.id, move: opening.moves[i], ply: i + 1 });
        break;
      }
    }
  }

  return errors;
}

// Run as a standalone script
if (require.main === module) {
  const errors = validateOpenings();
  if (errors.length === 0) {
    console.log(`All ${OPENINGS.length} openings validated successfully.`);
    process.exit(0);
  } else {
    console.error('Invalid moves found:');
    for (const e of errors) {
      console.error(`  ${e.id}  ply ${e.ply}: "${e.move}"`);
    }
    process.exit(1);
  }
}
