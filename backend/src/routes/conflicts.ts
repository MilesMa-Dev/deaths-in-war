import { Router } from 'express';
import { loadData } from '../scraper/storage.js';
import type { StatsResponse } from '../types/index.js';

export const conflictsRouter = Router();

conflictsRouter.get('/conflicts', (_req, res) => {
  const data = loadData();
  if (!data) {
    return res.status(503).json({ error: 'Data not yet available. Scraper may still be running.' });
  }
  res.json(data.conflicts);
});

conflictsRouter.get('/stats', (_req, res) => {
  const data = loadData();
  if (!data) {
    return res.status(503).json({ error: 'Data not yet available.' });
  }

  const byIntensity: Record<string, number> = {};
  for (const c of data.conflicts) {
    byIntensity[c.intensity] = (byIntensity[c.intensity] || 0) + 1;
  }

  const stats: StatsResponse = {
    totalDeaths: data.totalDeaths,
    totalConflicts: data.conflicts.length,
    byIntensity,
    lastUpdated: data.lastScraped,
  };

  res.json(stats);
});

conflictsRouter.get('/last-updated', (_req, res) => {
  const data = loadData();
  if (!data) {
    return res.status(503).json({ error: 'Data not yet available.' });
  }
  res.json({ lastUpdated: data.lastScraped });
});
