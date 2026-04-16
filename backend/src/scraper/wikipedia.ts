import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Conflict, ConflictsData } from '../types/index.js';
import { getCoordinatesForCountries } from './country-coordinates.js';
import { saveData } from './storage.js';

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const PAGE_TITLE = 'List_of_ongoing_armed_conflicts';

// Override coordinates for conflicts where first country != main conflict zone
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

const SECTIONS: SectionDef[] = [
  { index: '3', intensity: 'major_war' },
  { index: '4', intensity: 'war' },
  { index: '5', intensity: 'minor_conflict' },
  { index: '6', intensity: 'skirmish' },
];

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

function extractTextClean($el: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): string {
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

function extractCountriesFromCell($cell: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): string[] {
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

function parseConflictTable(html: string, intensity: Intensity): Conflict[] {
  const $ = cheerio.load(html);
  const conflicts: Conflict[] = [];
  const table = $('table.wikitable');

  if (table.length === 0) return conflicts;

  const rows = table.find('tr');

  rows.each((i, row) => {
    if (i === 0) return; // skip header

    const cells = $(row).find('td');
    if (cells.length < 5) return;

    try {
      const startYearText = extractTextClean($(cells[0]).clone(), $);
      const startYear = parseInt(startYearText, 10);
      if (isNaN(startYear)) return;

      const nameCell = $(cells[1]).clone();
      nameCell.find('sup, style, .mw-parser-output style').remove();
      const firstLink = $(cells[1]).find('a').first();
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

      const continent = extractTextClean($(cells[2]).clone(), $);
      const locationCell = $(cells[3]);
      const locationRaw = extractTextClean(locationCell.clone(), $);
      const countries = extractCountriesFromCell(locationCell.clone(), $);

      const cumulativeRaw = extractTextClean($(cells[4]).clone(), $);
      const cumulativeDisplay = $(cells[4]).clone().find('sup').remove().end().text().trim();
      const total = parseNumber(cumulativeRaw);

      let recent: number | undefined;
      if (cells.length >= 6) {
        const recentRaw = extractTextClean($(cells[5]).clone(), $);
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

export async function scrapeConflicts(): Promise<ConflictsData> {
  console.log('[Scraper] Starting Wikipedia scrape...');
  const allConflicts: Conflict[] = [];

  for (const section of SECTIONS) {
    try {
      console.log(`[Scraper] Fetching section ${section.index} (${section.intensity})...`);
      const html = await fetchSectionHtml(section.index);
      const conflicts = parseConflictTable(html, section.intensity);
      console.log(`[Scraper] Found ${conflicts.length} ${section.intensity} conflicts`);
      allConflicts.push(...conflicts);
    } catch (err) {
      console.error(`[Scraper] Error fetching section ${section.index}:`, err);
    }
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
