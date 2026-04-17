import { Router } from 'express';
import { loadData } from '../scraper/storage.js';
import type { StatsResponse } from '../types/index.js';

export const conflictsRouter = Router();

const API_CACHE_HEADER = 'public, max-age=3600, s-maxage=86400';

conflictsRouter.get('/conflicts', (_req, res) => {
  const data = loadData();
  if (!data) {
    return res.status(503).json({ error: 'Data not yet available. Scraper may still be running.' });
  }
  res.set('Cache-Control', API_CACHE_HEADER);
  res.set('X-Robots-Tag', 'noindex');
  res.set('Link', '<https://deaths-in-war.vercel.app/>; rel="canonical"');
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

  res.set('Cache-Control', API_CACHE_HEADER);
  res.set('X-Robots-Tag', 'noindex');
  res.set('Link', '<https://deaths-in-war.vercel.app/>; rel="canonical"');
  res.json(stats);
});

conflictsRouter.get('/conflicts/:id', (req, res) => {
  const data = loadData();
  if (!data) {
    return res.status(503).json({ error: 'Data not yet available.' });
  }
  const conflict = data.conflicts.find(c => c.id === req.params.id);
  if (!conflict) {
    return res.status(404).json({ error: 'Conflict not found.' });
  }
  res.set('Cache-Control', API_CACHE_HEADER);
  res.json(conflict);
});

conflictsRouter.get('/last-updated', (_req, res) => {
  const data = loadData();
  if (!data) {
    return res.status(503).json({ error: 'Data not yet available.' });
  }
  res.set('Cache-Control', API_CACHE_HEADER);
  res.json({ lastUpdated: data.lastScraped });
});
