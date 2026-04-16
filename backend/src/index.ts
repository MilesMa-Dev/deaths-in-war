import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { conflictsRouter } from './routes/conflicts.js';
import { scrapeConflicts } from './scraper/wikipedia.js';
import { loadData } from './scraper/storage.js';

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json());

app.use('/api', conflictsRouter);

app.get('/health', (_req, res) => {
  const data = loadData();
  res.json({
    status: 'ok',
    hasData: !!data,
    lastScraped: data?.lastScraped ?? null,
  });
});

function isDataStale(lastScraped: string): boolean {
  return Date.now() - new Date(lastScraped).getTime() > DATA_MAX_AGE_MS;
}

async function bootstrap() {
  const existing = loadData();
  const needsScrape = !existing || isDataStale(existing.lastScraped);

  if (!existing) {
    console.log('[Bootstrap] No existing data found, running initial scrape...');
  } else if (isDataStale(existing.lastScraped)) {
    console.log(`[Bootstrap] Data is stale (last scraped: ${existing.lastScraped}), re-scraping...`);
  } else {
    console.log(`[Bootstrap] Loaded existing data with ${existing.conflicts.length} conflicts.`);
  }

  if (needsScrape) {
    try {
      await scrapeConflicts();
      console.log('[Bootstrap] Scrape completed.');
    } catch (err) {
      console.error('[Bootstrap] Scrape failed:', err);
    }
  }

  cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Starting daily scrape...');
    try {
      await scrapeConflicts();
      console.log('[Cron] Daily scrape completed.');
    } catch (err) {
      console.error('[Cron] Daily scrape failed:', err);
    }
  });

  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

bootstrap();
