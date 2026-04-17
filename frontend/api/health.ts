import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadData } from '../server/storage.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const data = await loadData();
  res.json({
    status: 'ok',
    hasData: !!data,
    lastScraped: data?.lastScraped ?? null,
  });
}
