import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadData } from '../../server/storage.js';

const API_CACHE_HEADER = 'public, max-age=3600, s-maxage=86400';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const data = await loadData();
  if (!data) {
    return res.status(503).json({ error: 'Data not yet available. Scraper may still be running.' });
  }
  res.setHeader('Cache-Control', API_CACHE_HEADER);
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Link', '<https://deaths-in-war.vercel.app/>; rel="canonical"');
  res.json(data.conflicts);
}
