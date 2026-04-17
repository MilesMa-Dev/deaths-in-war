import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendCrawlerLog } from '../server/middleware/crawler-logger.js';
import type { CrawlerLogEntry } from '../server/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-ingest-secret'];
  if (secret !== (process.env.CRAWLER_INGEST_SECRET || 'default-dev-secret')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const entries = req.body?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Missing entries array' });
  }

  const validEntries: CrawlerLogEntry[] = [];
  for (const e of entries.slice(0, 50)) {
    if (e.crawler && e.path && e.timestamp) {
      validEntries.push({
        timestamp: e.timestamp,
        crawler: e.crawler,
        path: e.path,
        statusCode: e.statusCode ?? 200,
        userAgent: e.userAgent ?? '',
        ip: e.ip ?? '',
      });
    }
  }

  await appendCrawlerLog(validEntries);
  res.json({ ingested: validEntries.length });
}
