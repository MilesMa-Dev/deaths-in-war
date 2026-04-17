import 'dotenv/config';
import { scrapeConflicts } from './wikipedia.js';

scrapeConflicts()
  .then((data) => {
    console.log(`Done. ${data.conflicts.length} conflicts scraped.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Scrape failed:', err);
    process.exit(1);
  });
