import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadData } from '../server/storage.js';
import type { StatsResponse } from '../server/types.js';

const API_CACHE_HEADER = 'public, max-age=3600, s-maxage=86400';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const data = await loadData();
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

  res.setHeader('Cache-Control', API_CACHE_HEADER);
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Link', '<https://www.deaths-in-war.com/>; rel="canonical"');
  res.json(stats);
}
