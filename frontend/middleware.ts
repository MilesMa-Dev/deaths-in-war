import type { RequestContext } from '@vercel/edge';

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

const BACKEND_URL = 'https://deaths-in-war-backend.onrender.com';
const INGEST_SECRET = process.env.CRAWLER_INGEST_SECRET || 'default-dev-secret';

function identifyCrawler(ua: string): string | null {
  for (const { pattern, name } of AI_BOT_PATTERNS) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

async function sendLog(entry: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/crawler-ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ingest-Secret': INGEST_SECRET,
      },
      body: JSON.stringify({ entries: [entry] }),
    });
  } catch {
    // Best-effort: silently ignore failures
  }
}

export default function middleware(request: Request, context: RequestContext) {
  const ua = request.headers.get('user-agent') ?? '';
  const crawler = identifyCrawler(ua);

  if (!crawler) return;

  const url = new URL(request.url);

  const entry = {
    timestamp: new Date().toISOString(),
    crawler,
    path: url.pathname,
    statusCode: 200,
    userAgent: ua,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
  };

  context.waitUntil(sendLog(entry));
}

export const config = {
  matcher: [
    '/',
    '/llms.txt',
    '/llms-full.txt',
    '/robots.txt',
    '/sitemap.xml',
    '/conflict/:path*',
  ],
};
