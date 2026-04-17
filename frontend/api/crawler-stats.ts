import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCrawlerLogs } from '../server/middleware/crawler-logger.js';
import type { CrawlerLogEntry } from '../server/types.js';

interface CrawlerSummary {
  count: number;
  lastSeen: string;
  topPaths: { path: string; count: number }[];
}

function filterByDays(entries: CrawlerLogEntry[], days: number): CrawlerLogEntry[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return entries.filter(e => new Date(e.timestamp).getTime() >= cutoff);
}

function topN<T>(items: T[], keyFn: (item: T) => string, n: number): { path: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([path, count]) => ({ path, count }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);
  const logs = await getCrawlerLogs();
  const filtered = filterByDays(logs.entries, days);

  const byCrawler: Record<string, CrawlerSummary> = {};

  for (const entry of filtered) {
    if (!byCrawler[entry.crawler]) {
      byCrawler[entry.crawler] = { count: 0, lastSeen: entry.timestamp, topPaths: [] };
    }
    const summary = byCrawler[entry.crawler];
    summary.count++;
    if (entry.timestamp > summary.lastSeen) {
      summary.lastSeen = entry.timestamp;
    }
  }

  for (const crawler of Object.keys(byCrawler)) {
    const crawlerEntries = filtered.filter(e => e.crawler === crawler);
    byCrawler[crawler].topPaths = topN(crawlerEntries, e => e.path, 5);
  }

  const sortedByCrawler: Record<string, CrawlerSummary> = {};
  Object.entries(byCrawler)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([key, val]) => { sortedByCrawler[key] = val; });

  res.json({
    totalCrawls: filtered.length,
    period: `last ${days} days`,
    totalLogEntries: logs.entries.length,
    byCrawler: sortedByCrawler,
  });
}
