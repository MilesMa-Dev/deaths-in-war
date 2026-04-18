import type { RequestContext } from '@vercel/edge';

const AI_BOT_PATTERNS: { pattern: RegExp; name: string }[] = [
  // --- OpenAI ---
  { pattern: /GPTBot/i, name: 'GPTBot (OpenAI)' },
  { pattern: /ChatGPT-User/i, name: 'ChatGPT-User (OpenAI)' },
  { pattern: /OAI-SearchBot/i, name: 'OAI-SearchBot (OpenAI)' },

  // --- Anthropic ---
  { pattern: /Claude-Web/i, name: 'Claude-Web (Anthropic)' },
  { pattern: /ClaudeBot/i, name: 'ClaudeBot (Anthropic)' },
  { pattern: /Claude-SearchBot/i, name: 'Claude-SearchBot (Anthropic)' },
  { pattern: /anthropic-ai/i, name: 'Anthropic AI' },

  // --- Google ---
  { pattern: /Google-Extended/i, name: 'Google-Extended (Gemini)' },
  { pattern: /GoogleOther/i, name: 'GoogleOther' },
  { pattern: /Googlebot/i, name: 'Googlebot' },

  // --- Microsoft ---
  { pattern: /Bingbot/i, name: 'Bingbot (Microsoft)' },

  // --- Perplexity ---
  { pattern: /PerplexityBot/i, name: 'PerplexityBot' },
  { pattern: /Perplexity-User/i, name: 'Perplexity-User' },

  // --- Meta ---
  { pattern: /Meta-ExternalAgent/i, name: 'Meta AI' },
  { pattern: /Meta-ExternalFetcher/i, name: 'Meta-ExternalFetcher' },
  { pattern: /FacebookBot/i, name: 'FacebookBot (Meta)' },
  { pattern: /facebookexternalhit/i, name: 'Facebook External Hit' },

  // --- Apple ---
  { pattern: /Applebot-Extended/i, name: 'Applebot-Extended (Apple Intelligence)' },
  { pattern: /Applebot/i, name: 'Applebot' },

  // --- Amazon ---
  { pattern: /Amazonbot/i, name: 'Amazonbot' },

  // --- DeepSeek (深度求索) ---
  { pattern: /DeepSeekBot/i, name: 'DeepSeekBot (深度求索)' },

  // --- ByteDance (字节跳动) / 豆包 ---
  { pattern: /Doubaobot/i, name: 'Doubaobot (豆包/ByteDance)' },
  { pattern: /Bytespider/i, name: 'Bytespider (ByteDance)' },
  { pattern: /TikTokSpider/i, name: 'TikTokSpider (ByteDance)' },
  { pattern: /ByteDance-AI/i, name: 'ByteDance-AI' },
  { pattern: /ByteBot/i, name: 'ByteBot (ByteDance)' },

  // --- Moonshot AI (月之暗面) / Kimi ---
  { pattern: /Kimibot/i, name: 'Kimibot (Kimi/Moonshot)' },
  { pattern: /KimiCrawler/i, name: 'KimiCrawler (Kimi/Moonshot)' },
  { pattern: /Moonshot-AI/i, name: 'Moonshot-AI' },
  { pattern: /MoonshotBot/i, name: 'MoonshotBot (Moonshot)' },

  // --- Alibaba (阿里巴巴) / 通义千问 ---
  { pattern: /QwenBot/i, name: 'QwenBot (通义千问/Alibaba)' },
  { pattern: /TongyiBot/i, name: 'TongyiBot (通义千问/Alibaba)' },
  { pattern: /Tongyi-Crawler/i, name: 'Tongyi-Crawler (Alibaba)' },
  { pattern: /AlibabaBot/i, name: 'AlibabaBot (Alibaba)' },

  // --- Zhipu AI (智谱) / ChatGLM ---
  { pattern: /ChatGLM-Spider/i, name: 'ChatGLM-Spider (智谱清言)' },

  // --- Baidu (百度) / 文心一言 ---
  { pattern: /Baiduspider/i, name: 'Baiduspider (百度)' },
  { pattern: /PanguBot/i, name: 'PanguBot (华为盘古)' },

  // --- xAI ---
  { pattern: /Grok-bot/i, name: 'Grok-bot (xAI)' },

  // --- Mistral ---
  { pattern: /MistralAI-User/i, name: 'MistralAI-User (Mistral)' },

  // --- Cohere ---
  { pattern: /cohere-ai/i, name: 'Cohere AI' },
  { pattern: /cohere-training/i, name: 'Cohere Training Crawler' },

  // --- Other AI crawlers ---
  { pattern: /CCBot/i, name: 'CCBot (Common Crawl)' },
  { pattern: /YouBot/i, name: 'YouBot (You.com)' },
  { pattern: /DuckAssistBot/i, name: 'DuckAssistBot (DuckDuckGo)' },
  { pattern: /DuckDuckBot/i, name: 'DuckDuckBot' },
  { pattern: /Diffbot/i, name: 'Diffbot' },
  { pattern: /Bravebot/i, name: 'Bravebot (Brave Search)' },
  { pattern: /iAskBot/i, name: 'iAskBot' },
  { pattern: /Crawl4AI/i, name: 'Crawl4AI' },
  { pattern: /FirecrawlAgent/i, name: 'FirecrawlAgent' },
  { pattern: /YandexBot/i, name: 'YandexBot' },
];

const INGEST_SECRET = process.env.CRAWLER_INGEST_SECRET || 'default-dev-secret';

function identifyCrawler(ua: string): string | null {
  for (const { pattern, name } of AI_BOT_PATTERNS) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

async function sendLog(origin: string, entry: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${origin}/api/crawler-ingest`, {
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

  context.waitUntil(sendLog(url.origin, entry));
}

export const config = {
  matcher: [
    '/',
    '/llms.txt',
    '/llms-full.txt',
    '/robots.txt',
    '/sitemap.xml',
    '/conflict/:path*',
    '/api/:path*',
  ],
};
