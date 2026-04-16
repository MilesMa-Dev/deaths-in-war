import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ConflictsData } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'data', 'conflicts.json');

export function saveData(data: ConflictsData): void {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[Storage] Saved ${data.conflicts.length} conflicts to ${DATA_PATH}`);
}

export function loadData(): ConflictsData | null {
  try {
    if (!fs.existsSync(DATA_PATH)) return null;
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as ConflictsData;
  } catch {
    return null;
  }
}
