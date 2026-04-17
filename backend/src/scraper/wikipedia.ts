import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { Conflict, ConflictsData } from '../types/index.js';
import { getCoordinatesForCountries } from './country-coordinates.js';
import { saveData, loadData } from './storage.js';
import { loadStaticRegions } from './static-regions.js';

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const PAGE_TITLE = 'List_of_ongoing_armed_conflicts';

const CONFLICT_COORD_OVERRIDES: Record<string, { lat: number; lng: number }> = {
  'kashmir-conflict': { lat: 34.08, lng: 74.80 },
  'yemeni-civil-war': { lat: 15.55, lng: 48.52 },
  'syrian-conflict': { lat: 34.80, lng: 38.99 },
  'mexican-drug-war': { lat: 23.63, lng: -102.55 },
  'russo-ukrainian-war': { lat: 48.38, lng: 31.17 },
  'congolese-conflicts': { lat: -2.50, lng: 28.80 },
  'somali-civil-war': { lat: 5.15, lng: 46.20 },
  'sudanese-civil-wars': { lat: 12.86, lng: 30.22 },
  'insurgencies-in-pakistan': { lat: 30.38, lng: 69.35 },
  'north-caucasus-conflict': { lat: 43.0, lng: 45.0 },
  'western-sahara-conflict': { lat: 24.22, lng: -12.89 },
  'kurdish-nationalist-conflicts': { lat: 36.40, lng: 44.35 },
};

type Intensity = Conflict['intensity'];

interface SectionDef {
  index: string;
  intensity: Intensity;
}

const SECTION_PATTERNS: { pattern: RegExp; intensity: Intensity }[] = [
  { pattern: /major\s+wars/i,  intensity: 'major_war' },
  { pattern: /minor\s+wars/i,  intensity: 'war' },
  { pattern: /^conflicts\b/i,  intensity: 'minor_conflict' },
  { pattern: /skirmishes/i,    intensity: 'skirmish' },
];

// Ordered by priority — first matching pattern claims the column
const COLUMN_PATTERNS: [string, RegExp][] = [
  ['startYear',  /start\s*(of|year)|started/i],
  ['cumulative', /cumulative/i],
  ['name',       /conflict|war|name/i],
  ['continent',  /continent|region/i],
  ['location',   /location|countr/i],
  ['recent',     /\b20[2-3]\d\b|recent|current.*year/i],
];

const MIN_EXPECTED_CONFLICTS = 10;
const MAX_ZERO_DEATH_RATIO = 0.5;

function parseNumber(raw: string): number {
  const cleaned = raw
    .replace(/\[.*?\]/g, '')       // remove citation brackets
    .replace(/\(.*?\)/g, '')       // remove parenthetical notes
    .replace(/[,\s]+/g, '')        // remove commas and spaces
    .replace(/\+/g, '')            // remove plus signs
    .replace(/[–−-]/g, '-')        // normalize dashes
    .trim();

  // Handle ranges like "172226-450000" — take the first (conservative) number
  const rangeParts = cleaned.split('-').filter(p => p.length > 0);
  const numStr = rangeParts[0] || '0';

  const num = parseInt(numStr, 10);
  return isNaN(num) ? 0 : num;
}

function extractTextClean($el: cheerio.Cheerio<Element>, $: cheerio.CheerioAPI): string {
  // Remove sup elements (citations) before extracting text
  $el.find('sup').remove();
  return $el.text().trim();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractCountriesFromCell($cell: cheerio.Cheerio<Element>, $: cheerio.CheerioAPI): string[] {
  // Extract country names from <a> link tags within the location cell
  const links = $cell.find('a');
  const countries: string[] = [];

  links.each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 1 && !text.match(/^\d/) && !text.match(/^\[/)) {
      countries.push(text);
    }
  });

  if (countries.length > 0) return countries;

  // Fallback: split plain text by whitespace heuristics
  $cell.find('sup').remove();
  const raw = $cell.text().trim();
  return raw
    .split(/[\n,]+/)
    .map(s => s.replace(/\[.*?\]/g, '').trim())
    .filter(s => s.length > 1 && !s.match(/^\d/) && !s.match(/^\[/) && !s.match(/^[.{]/));
}

async function fetchSectionHtml(sectionIndex: string): Promise<string> {
  const resp = await axios.get(WIKI_API, {
    params: {
      action: 'parse',
      page: PAGE_TITLE,
      prop: 'text',
      format: 'json',
      section: sectionIndex,
    },
    headers: {
      'User-Agent': 'DeathsInWarTracker/1.0 (educational project)',
    },
  });

  return resp.data.parse.text['*'];
}

async function discoverSections(): Promise<SectionDef[]> {
  const resp = await axios.get(WIKI_API, {
    params: {
      action: 'parse',
      page: PAGE_TITLE,
      prop: 'sections',
      format: 'json',
    },
    headers: {
      'User-Agent': 'DeathsInWarTracker/1.0 (educational project)',
    },
  });

  const wikiSections: { line: string; index: string }[] = resp.data.parse.sections;
  const discovered: SectionDef[] = [];

  for (const sp of SECTION_PATTERNS) {
    const match = wikiSections.find(s => sp.pattern.test(s.line));
    if (match) {
      discovered.push({ index: match.index, intensity: sp.intensity });
    } else {
      console.warn(`[Scraper] Could not find section matching /${sp.pattern.source}/ — this intensity will be missing`);
    }
  }

  if (discovered.length === 0) {
    throw new Error('Failed to discover any conflict sections from Wikipedia page structure');
  }

  console.log(`[Scraper] Discovered ${discovered.length} sections: ${discovered.map(s => `${s.intensity}=#${s.index}`).join(', ')}`);
  return discovered;
}

function detectColumnMapping($: cheerio.CheerioAPI, table: cheerio.Cheerio<Element>): Record<string, number> {
  const headers = table.find('tr').first().find('th');
  const mapping: Record<string, number> = {};
  const claimed = new Set<number>();

  headers.each((i, el) => {
    const text = $(el).text().trim();
    for (const [field, pattern] of COLUMN_PATTERNS) {
      if (pattern.test(text) && !(field in mapping) && !claimed.has(i)) {
        mapping[field] = i;
        claimed.add(i);
        break;
      }
    }
  });

  // For "recent", pick the highest-year column if multiple year columns exist
  if (!('recent' in mapping)) {
    let bestYear = 0;
    headers.each((i, el) => {
      if (claimed.has(i)) return;
      const text = $(el).text().trim();
      const yearMatch = text.match(/\b(20[2-3]\d)\b/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        if (year > bestYear) {
          bestYear = year;
          mapping['recent'] = i;
        }
      }
    });
  }

  const required = ['startYear', 'name', 'location', 'cumulative'];
  const missing = required.filter(f => !(f in mapping));
  if (missing.length > 0) {
    throw new Error(`Table header mapping failed — missing columns: ${missing.join(', ')}. Found headers: ${headers.map((_, el) => $(el).text().trim()).toArray().join(' | ')}`);
  }

  return mapping;
}

function parseConflictTable(html: string, intensity: Intensity): Conflict[] {
  const $ = cheerio.load(html);
  const conflicts: Conflict[] = [];
  const table = $('table.wikitable');

  if (table.length === 0) return conflicts;

  const col = detectColumnMapping($, table);
  const rows = table.find('tr');
  const minCells = Math.max(...Object.values(col)) + 1;

  rows.each((i, row) => {
    if (i === 0) return;

    const cells = $(row).find('td');
    if (cells.length < minCells) return;

    try {
      const startYearText = extractTextClean($(cells[col.startYear]).clone(), $);
      const startYear = parseInt(startYearText, 10);
      if (isNaN(startYear)) return;

      const nameCell = $(cells[col.name]).clone();
      nameCell.find('sup, style, .mw-parser-output style').remove();
      const firstLink = $(cells[col.name]).find('a').first();
      const topLink = firstLink.text().trim();
      const linkHref = firstLink.attr('href') || '';
      let name = '';
      if (topLink && topLink.length > 3) {
        name = topLink;
      } else {
        const rawText = nameCell.text()
          .replace(/\.mw-parser-output[^}]*\}/g, '')
          .replace(/\{[^}]*\}/g, '')
          .trim();
        const nameLines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
        name = nameLines[0] || '';
      }
      name = name.replace(/\.mw-parser-output.*$/s, '').trim();
      if (!name) return;

      let conflictUrl = `https://en.wikipedia.org/wiki/${PAGE_TITLE}`;
      if (linkHref.startsWith('/wiki/')) {
        conflictUrl = `https://en.wikipedia.org${linkHref}`;
      }

      const locationCell = $(cells[col.location]);
      const locationRaw = extractTextClean(locationCell.clone(), $);
      const countries = extractCountriesFromCell(locationCell.clone(), $);

      const cumulativeRaw = extractTextClean($(cells[col.cumulative]).clone(), $);
      const total = parseNumber(cumulativeRaw);

      let recent: number | undefined;
      if (col.recent !== undefined && cells.length > col.recent) {
        const recentRaw = extractTextClean($(cells[col.recent]).clone(), $);
        recent = parseNumber(recentRaw);
      }

      const id = slugify(name);
      const coordinates = CONFLICT_COORD_OVERRIDES[id] || getCoordinatesForCountries(countries);

      const conflict: Conflict = {
        id,
        name,
        location: locationRaw,
        countries,
        coordinates,
        startYear,
        deathToll: {
          total,
          totalDisplay: formatDisplay(total, cumulativeRaw.includes('+')),
          recent,
        },
        intensity,
        sourceUrl: conflictUrl,
        lastUpdated: new Date().toISOString(),
      };

      conflicts.push(conflict);
    } catch (err) {
      console.warn(`[Scraper] Failed to parse row ${i}:`, err);
    }
  });

  return conflicts;
}

function formatDisplay(num: number, hasPlus: boolean): string {
  const formatted = num.toLocaleString('en-US');
  return hasPlus ? `${formatted}+` : formatted;
}

interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

function validateScrapedData(
  conflicts: Conflict[],
  sectionCounts: Record<string, number>,
): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (conflicts.length < MIN_EXPECTED_CONFLICTS) {
    errors.push(`Only ${conflicts.length} conflicts found (expected >= ${MIN_EXPECTED_CONFLICTS})`);
  }

  for (const [intensity, count] of Object.entries(sectionCounts)) {
    if (count === 0) {
      warnings.push(`Section "${intensity}" returned 0 conflicts`);
    }
  }

  const zeroDeathCount = conflicts.filter(c => c.deathToll.total === 0).length;
  if (conflicts.length > 0 && zeroDeathCount / conflicts.length > MAX_ZERO_DEATH_RATIO) {
    warnings.push(`${zeroDeathCount}/${conflicts.length} conflicts have 0 deaths (>${MAX_ZERO_DEATH_RATIO * 100}%)`);
  }

  const noCoordCount = conflicts.filter(c => c.coordinates.lat === 0 && c.coordinates.lng === 0).length;
  if (noCoordCount > 0) {
    warnings.push(`${noCoordCount} conflict(s) have fallback (0,0) coordinates`);
  }

  return { valid: errors.length === 0, warnings, errors };
}

export async function scrapeConflicts(): Promise<ConflictsData> {
  console.log('[Scraper] Starting Wikipedia scrape...');
  const existingData = loadData();

  let sections: SectionDef[];
  try {
    sections = await discoverSections();
  } catch (err) {
    console.error('[Scraper] Section discovery failed:', err);
    if (existingData) {
      console.warn('[Scraper] Returning existing data as fallback');
      return existingData;
    }
    throw err;
  }

  const allConflicts: Conflict[] = [];
  const sectionCounts: Record<string, number> = {};

  for (const section of sections) {
    try {
      console.log(`[Scraper] Fetching section ${section.index} (${section.intensity})...`);
      const html = await fetchSectionHtml(section.index);
      const conflicts = parseConflictTable(html, section.intensity);
      console.log(`[Scraper] Found ${conflicts.length} ${section.intensity} conflicts`);
      sectionCounts[section.intensity] = conflicts.length;
      allConflicts.push(...conflicts);
    } catch (err) {
      console.error(`[Scraper] Error fetching section ${section.index}:`, err);
      sectionCounts[section.intensity] = 0;
    }
  }

  const validation = validateScrapedData(allConflicts, sectionCounts);

  for (const w of validation.warnings) {
    console.warn(`[Scraper][WARN] ${w}`);
  }
  for (const e of validation.errors) {
    console.error(`[Scraper][ERROR] ${e}`);
  }

  if (!validation.valid) {
    console.error('[Scraper] Validation failed — scraped data is likely corrupt');
    if (existingData) {
      console.warn('[Scraper] Keeping existing data, not overwriting');
      return existingData;
    }
    console.warn('[Scraper] No existing data to fall back to — saving partial data');
  }

  const regionMap = loadStaticRegions();
  if (regionMap) {
    let enriched = 0;
    for (const conflict of allConflicts) {
      const regions = regionMap[conflict.name];
      if (regions && regions.length > 0) {
        conflict.affectedRegions = regions;
        enriched++;
      }
    }
    console.log(`[Scraper] Applied static region data to ${enriched}/${allConflicts.length} conflicts.`);
  }

  const totalDeaths = allConflicts.reduce((sum, c) => sum + c.deathToll.total, 0);

  const data: ConflictsData = {
    conflicts: allConflicts,
    lastScraped: new Date().toISOString(),
    totalDeaths,
  };

  saveData(data);
  console.log(`[Scraper] Complete. ${allConflicts.length} conflicts, ~${totalDeaths.toLocaleString()} total deaths.`);

  return data;
}
