import { put, head, getDownloadUrl } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Conflict, ConflictsData, CrawlerLogEntry, CrawlerLogs } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANUAL_PATH = path.join(__dirname, 'data', 'manual-conflicts.json');

const CONFLICTS_BLOB_KEY = 'conflicts.json';
const CRAWLER_LOGS_BLOB_KEY = 'crawler-logs.json';
const MAX_LOG_ENTRIES = 10_000;

// ---------------------------------------------------------------------------
// Conflict data — Vercel Blob
// ---------------------------------------------------------------------------

export async function saveData(data: ConflictsData): Promise<void> {
  await put(CONFLICTS_BLOB_KEY, JSON.stringify(data, null, 2), {
    access: 'private',
    addRandomSuffix: false,
  });
  console.log(`[Storage] Saved ${data.conflicts.length} conflicts to blob`);
}

export async function loadData(): Promise<ConflictsData | null> {
  try {
    const meta = await head(CONFLICTS_BLOB_KEY);
    const downloadUrl = await getDownloadUrl(meta.url);
    const resp = await fetch(downloadUrl, { cache: 'no-store' });
    if (!resp.ok) return null;
    const data = (await resp.json()) as ConflictsData;

    const manual = loadManualConflicts();
    if (manual.length > 0) {
      const existingIds = new Set(data.conflicts.map(c => c.id));
      for (const mc of manual) {
        if (!existingIds.has(mc.id)) {
          data.conflicts.push(mc);
          data.totalDeaths += mc.deathToll.total;
        }
      }
    }

    return data;
  } catch {
    return null;
  }
}

export function loadManualConflicts(): Conflict[] {
  try {
    if (!fs.existsSync(MANUAL_PATH)) return [];
    const raw = fs.readFileSync(MANUAL_PATH, 'utf-8');
    const entries = JSON.parse(raw) as Omit<Conflict, 'lastUpdated'>[];
    return entries.map(e => ({
      ...e,
      lastUpdated: new Date().toISOString(),
    }));
  } catch (err) {
    console.warn('[Storage] Failed to load manual conflicts:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Crawler logs — Vercel Blob
// ---------------------------------------------------------------------------

export async function saveCrawlerLogs(logs: CrawlerLogs): Promise<void> {
  await put(CRAWLER_LOGS_BLOB_KEY, JSON.stringify(logs, null, 2), {
    access: 'private',
    addRandomSuffix: false,
  });
}

export async function loadCrawlerLogs(): Promise<CrawlerLogs> {
  try {
    const meta = await head(CRAWLER_LOGS_BLOB_KEY);
    const downloadUrl = await getDownloadUrl(meta.url);
    const resp = await fetch(downloadUrl, { cache: 'no-store' });
    if (!resp.ok) return { entries: [] };
    return (await resp.json()) as CrawlerLogs;
  } catch {
    return { entries: [] };
  }
}

export async function appendCrawlerLogs(newEntries: CrawlerLogEntry[]): Promise<void> {
  const logs = await loadCrawlerLogs();
  logs.entries.push(...newEntries);
  if (logs.entries.length > MAX_LOG_ENTRIES) {
    logs.entries = logs.entries.slice(-MAX_LOG_ENTRIES);
  }
  await saveCrawlerLogs(logs);
}
