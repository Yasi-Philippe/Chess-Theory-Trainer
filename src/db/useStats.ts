import { useState, useEffect } from 'react';
import { getAllStats, OpeningStats } from './stats';

export function useAllStats(): { stats: Map<string, OpeningStats>; loading: boolean } {
  const [stats, setStats] = useState<Map<string, OpeningStats>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAllStats().then(rows => {
      if (cancelled) return;
      const map = new Map<string, OpeningStats>();
      for (const row of rows) map.set(row.opening_id, row);
      setStats(map);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { stats, loading };
}
