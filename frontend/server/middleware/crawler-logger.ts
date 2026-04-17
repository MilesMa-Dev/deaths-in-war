import type { CrawlerLogEntry } from '../types.js';
import { loadCrawlerLogs, appendCrawlerLogs } from '../storage.js';

export type { CrawlerLogEntry };

export async function getCrawlerLogs() {
  return loadCrawlerLogs();
}

export async function appendCrawlerLog(entries: CrawlerLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await appendCrawlerLogs(entries);
}
