import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AffectedRegion } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGIONS_PATH = path.join(__dirname, '..', 'data', 'regions-static.json');

export function loadStaticRegions(): Record<string, AffectedRegion[]> | null {
  try {
    if (!fs.existsSync(REGIONS_PATH)) {
      console.warn('[Regions] No static regions file found at', REGIONS_PATH);
      return null;
    }
    const raw = fs.readFileSync(REGIONS_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, AffectedRegion[]>;
  } catch (err) {
    console.warn('[Regions] Failed to load static regions:', err);
    return null;
  }
}
