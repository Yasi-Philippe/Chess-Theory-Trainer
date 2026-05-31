/**
 * Validates that every opening in openings.ts has a legal move sequence.
 * A failing test here means a typo was introduced in the opening data.
 */
import { validateOpenings } from '../../../scripts/validate-openings';

describe('Opening data integrity', () => {
  it('all openings have valid SAN move sequences', () => {
    const errors = validateOpenings();
    if (errors.length > 0) {
      const msg = errors
        .map(e => `  ${e.id}  ply ${e.ply}: "${e.move}"`)
        .join('\n');
      fail(`Invalid moves found in openings.ts:\n${msg}`);
    }
    expect(errors).toHaveLength(0);
  });
});
