import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeConflicts } from '../../server/scraper/wikipedia.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const data = await scrapeConflicts();
    res.json({
      ok: true,
      conflicts: data.conflicts.length,
      totalDeaths: data.totalDeaths,
      lastScraped: data.lastScraped,
    });
  } catch (err) {
    console.error('[Cron] Scrape failed:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
