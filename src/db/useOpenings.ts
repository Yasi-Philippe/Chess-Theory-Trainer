import { useState, useEffect } from 'react';
import type { Opening, PlayerColor, OpeningCategory } from '../types';
import { getByCategory } from './openings';
import { seedOpenings } from './seed';

interface UseOpeningsResult {
  openings: Opening[];
  loading: boolean;
  error: string | null;
}

/**
 * Loads openings from the SQLite database, seeding on first use.
 * Re-fetches whenever category or color changes.
 */
export function useOpenings(
  category: OpeningCategory,
  color: PlayerColor,
): UseOpeningsResult {
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        await seedOpenings();
        const data = await getByCategory(category, color);
        if (!cancelled) {
          setOpenings(data);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load openings');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [category, color]);

  return { openings, loading, error };
}
