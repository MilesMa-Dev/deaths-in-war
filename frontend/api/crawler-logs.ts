import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCrawlerLogs } from '../server/middleware/crawler-logger.js';
import type { CrawlerLogEntry } from '../server/types.js';

function filterByDays(entries: CrawlerLogEntry[], days: number): CrawlerLogEntry[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return entries.filter(e => new Date(e.timestamp).getTime() >= cutoff);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 90);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 1000);
  const logs = await getCrawlerLogs();
  const filtered = filterByDays(logs.entries, days);

  res.json({
    total: filtered.length,
    period: `last ${days} days`,
    entries: filtered.slice(-limit).reverse(),
  });
}
