import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RequestHandler } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, '..', 'data', 'crawler-logs.json');
const MAX_LOG_ENTRIES = 10_000;

const AI_BOT_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /GPTBot/i, name: 'GPTBot (OpenAI)' },
  { pattern: /ChatGPT-User/i, name: 'ChatGPT-User' },
  { pattern: /ClaudeBot/i, name: 'ClaudeBot (Anthropic)' },
  { pattern: /anthropic-ai/i, name: 'Anthropic AI' },
  { pattern: /PerplexityBot/i, name: 'PerplexityBot' },
  { pattern: /Google-Extended/i, name: 'Google-Extended' },
  { pattern: /Googlebot/i, name: 'Googlebot' },
  { pattern: /Bingbot/i, name: 'Bingbot' },
  { pattern: /Amazonbot/i, name: 'Amazonbot' },
  { pattern: /cohere-ai/i, name: 'Cohere AI' },
  { pattern: /Meta-ExternalAgent/i, name: 'Meta AI' },
  { pattern: /YouBot/i, name: 'You.com Bot' },
  { pattern: /Bytespider/i, name: 'Bytespider (ByteDance)' },
  { pattern: /CCBot/i, name: 'CCBot (Common Crawl)' },
  { pattern: /Applebot/i, name: 'Applebot' },
  { pattern: /DuckDuckBot/i, name: 'DuckDuckBot' },
];

export interface CrawlerLogEntry {
  timestamp: string;
  crawler: string;
  path: string;
  statusCode: number;
  userAgent: string;
  ip: string;
}

interface CrawlerLogs {
  entries: CrawlerLogEntry[];
}

function identifyCrawler(ua: string): string | null {
  for (const { pattern, name } of AI_BOT_PATTERNS) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

function loadLogs(): CrawlerLogs {
  try {
    if (!fs.existsSync(LOG_PATH)) return { entries: [] };
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')) as CrawlerLogs;
  } catch {
    return { entries: [] };
  }
}

function saveLogs(logs: CrawlerLogs): void {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2), 'utf-8');
}

let writeBuffer: CrawlerLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (writeBuffer.length === 0) return;

    const logs = loadLogs();
    logs.entries.push(...writeBuffer);
    writeBuffer = [];

    if (logs.entries.length > MAX_LOG_ENTRIES) {
      logs.entries = logs.entries.slice(-MAX_LOG_ENTRIES);
    }
    saveLogs(logs);
  }, 5_000);
}

export function appendCrawlerLog(entry: CrawlerLogEntry): void {
  writeBuffer.push(entry);
  scheduleFlush();
}

export function getCrawlerLogs(): CrawlerLogs {
  const logs = loadLogs();
  if (writeBuffer.length > 0) {
    logs.entries.push(...writeBuffer);
  }
  return logs;
}

export const crawlerLoggerMiddleware: RequestHandler = (req, res, next) => {
  const ua = req.headers['user-agent'] ?? '';
  const crawler = identifyCrawler(ua);

  if (!crawler) return next();

  const entry: CrawlerLogEntry = {
    timestamp: new Date().toISOString(),
    crawler,
    path: req.originalUrl || req.url,
    statusCode: 0,
    userAgent: ua,
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '',
  };

  res.on('finish', () => {
    entry.statusCode = res.statusCode;
    writeBuffer.push(entry);
    scheduleFlush();
  });

  next();
};
