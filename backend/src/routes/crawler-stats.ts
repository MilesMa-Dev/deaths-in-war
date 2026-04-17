import { Router } from 'express';
import { getCrawlerLogs, appendCrawlerLog } from '../middleware/crawler-logger.js';
import type { CrawlerLogEntry } from '../middleware/crawler-logger.js';

export const crawlerStatsRouter = Router();

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

crawlerStatsRouter.get('/crawler-stats', (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);
  const logs = getCrawlerLogs();
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
});

crawlerStatsRouter.get('/crawler-logs', (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 90);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 1000);
  const logs = getCrawlerLogs();
  const filtered = filterByDays(logs.entries, days);

  res.json({
    total: filtered.length,
    period: `last ${days} days`,
    entries: filtered.slice(-limit).reverse(),
  });
});

crawlerStatsRouter.post('/crawler-ingest', (req, res) => {
  const secret = req.headers['x-ingest-secret'];
  if (secret !== (process.env.CRAWLER_INGEST_SECRET || 'default-dev-secret')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const entries = req.body?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Missing entries array' });
  }

  let ingested = 0;
  for (const e of entries.slice(0, 50)) {
    if (e.crawler && e.path && e.timestamp) {
      appendCrawlerLog({
        timestamp: e.timestamp,
        crawler: e.crawler,
        path: e.path,
        statusCode: e.statusCode ?? 200,
        userAgent: e.userAgent ?? '',
        ip: e.ip ?? '',
      });
      ingested++;
    }
  }

  res.json({ ingested });
});
