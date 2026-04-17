import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Conflict, ConflictsData } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'data', 'conflicts.json');
const MANUAL_PATH = path.join(__dirname, '..', 'data', 'manual-conflicts.json');

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
    const data = JSON.parse(raw) as ConflictsData;

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
