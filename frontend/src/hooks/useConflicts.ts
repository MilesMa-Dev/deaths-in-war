import { useState, useEffect } from 'react';
import type { Conflict, StatsResponse } from '../types';
import { fetchConflicts, fetchStats } from '../services/api';

export function useConflicts() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [conflictsData, statsData] = await Promise.all([
          fetchConflicts(),
          fetchStats(),
        ]);
        if (!cancelled) {
          setConflicts(conflictsData);
          setStats(statsData);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { conflicts, stats, loading, error };
}
