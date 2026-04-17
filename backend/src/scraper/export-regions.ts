import { createReadStream, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AffectedRegion } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UCDP_CSV_PATH = process.argv[2] || '/tmp/ged251/GEDEvent_v25_1.csv';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'regions-static.json');
const MIN_YEAR = 1989;
const MAX_REGIONS_PER_CONFLICT = 20;

const COUNTRY_MATCH: Record<string, string[]> = {
  'Arab–Israeli': ['Israel', 'Palestine'],
  'Myanmar civil war': ['Myanmar (Burma)'],
  'Sudanese civil wars': ['Sudan', 'South Sudan'],
  'Congolese conflicts': ['DR Congo (Zaire)', 'Democratic Republic of Congo'],
  'Somali Civil War': ['Somalia'],
  'Islamist insurgencies in the Maghreb': ['Algeria', 'Mali', 'Niger', 'Burkina Faso', 'Libya', 'Tunisia', 'Mauritania', 'Chad'],
  'Mexican drug war': ['Mexico'],
  'Russo-Ukrainian war': ['Ukraine', 'Russia (Soviet Union)'],
  'Colombian conflict': ['Colombia'],
  'Afghan conflict': ['Afghanistan'],
  'Insurgency in Ecuador': ['Ecuador'],
  'Civil conflicts in Nigeria': ['Nigeria'],
  'Venezuelan conflict': ['Venezuela'],
  'Yemeni civil war': ['Yemen (North Yemen)'],
  'Syrian conflict': ['Syria'],
  'Cameroonian conflicts': ['Cameroon'],
  'Central African Republic Civil War': ['Central African Republic'],
  'Ethiopian civil conflict': ['Ethiopia'],
  'Haitian crisis': ['Haiti'],
  'Kurdish nationalist conflicts': ['Turkey (Ottoman Empire)', 'Iraq', 'Syria', 'Iran'],
  'Insurgencies in Iran': ['Iran'],
  'Insurgencies in Turkey': ['Turkey (Ottoman Empire)'],
  'Jamaican political conflict': ['Jamaica'],
  'Kashmir conflict': ['India', 'Pakistan'],
  'Insurgencies in Pakistan': ['Pakistan'],
  'Insurgencies in India': ['India'],
  'Papua conflict': ['Indonesia'],
  'Civil conflict in the Philippines': ['Philippines'],
  'Cabinda War': ['Angola'],
  'Ethnic violence in Papua New Guinea': ['Papua New Guinea'],
  'Armed conflict for control of the favelas': ['Brazil'],
  'Insurgencies in Bangladesh': ['Bangladesh'],
  'Iraqi conflict': ['Iraq'],
  'Libyan crisis': ['Libya'],
  'Insurgency in Cabo Delgado': ['Mozambique'],
  'Honduran gang crackdown': ['Honduras'],
  'Western Sahara conflict': ['Morocco'],
  'Insurgency in Laos': ['Laos'],
  'Peruvian conflict': ['Peru'],
  'Islamist insurgency in Egypt': ['Egypt'],
  'Casamance conflict': ['Senegal'],
  'Nagorno-Karabakh conflict': ['Azerbaijan', 'Armenia'],
  'North Caucasus conflict': ['Russia (Soviet Union)'],
  'South Thailand insurgency': ['Thailand'],
  'Insurgency in Paraguay': ['Paraguay'],
  'Salvadoran gang crackdown': ['El Salvador'],
  'Cross border attacks in Sabah': ['Malaysia', 'Philippines'],
};

function normalizeCountry(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

interface UcdpRow {
  country: string;
  adm1: string;
  lat: number;
  lng: number;
  fatalities: number;
}

async function parseUcdpCsv(csvPath: string): Promise<UcdpRow[]> {
  const rows: UcdpRow[] = [];
  const rl = createInterface({ input: createReadStream(csvPath, 'utf-8') });
  let headers: string[] = [];
  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) { headers = parseCSVLine(line); continue; }

    const cols = parseCSVLine(line);
    const year = parseInt(cols[headers.indexOf('year')], 10);
    if (year < MIN_YEAR) continue;

    const country = cols[headers.indexOf('country')] || '';
    const adm1 = cols[headers.indexOf('adm_1')] || '';
    const lat = parseFloat(cols[headers.indexOf('latitude')]);
    const lng = parseFloat(cols[headers.indexOf('longitude')]);
    const fatalities = parseInt(cols[headers.indexOf('best')], 10) || 0;

    if (!country || isNaN(lat) || isNaN(lng)) continue;
    rows.push({ country, adm1, lat, lng, fatalities });
  }

  return rows;
}

function buildRegionsForConflict(
  conflictName: string,
  matchCountries: string[],
  events: UcdpRow[],
): AffectedRegion[] {
  const normalizedSet = new Set(matchCountries.map(normalizeCountry));
  const matched = events.filter(e => normalizedSet.has(normalizeCountry(e.country)));
  if (matched.length === 0) return [];

  const groups = new Map<string, { lats: number[]; lngs: number[]; count: number }>();
  for (const ev of matched) {
    const key = `${ev.country}::${ev.adm1 || 'Unknown'}`;
    const g = groups.get(key);
    if (g) { g.lats.push(ev.lat); g.lngs.push(ev.lng); g.count++; }
    else { groups.set(key, { lats: [ev.lat], lngs: [ev.lng], count: 1 }); }
  }

  const regions: AffectedRegion[] = [];
  for (const [key, g] of groups) {
    const name = key.split('::')[1] || key;
    const lat = +(g.lats.reduce((a, b) => a + b, 0) / g.lats.length).toFixed(4);
    const lng = +(g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length).toFixed(4);
    regions.push({ name, lat, lng, eventCount: g.count });
  }

  regions.sort((a, b) => b.eventCount - a.eventCount);
  return regions.slice(0, MAX_REGIONS_PER_CONFLICT);
}

async function main() {
  console.log(`[Export] Parsing UCDP CSV: ${UCDP_CSV_PATH}`);
  const events = await parseUcdpCsv(UCDP_CSV_PATH);
  console.log(`[Export] Loaded ${events.length} events`);

  const result: Record<string, AffectedRegion[]> = {};
  let total = 0;

  for (const [conflictName, countries] of Object.entries(COUNTRY_MATCH)) {
    const regions = buildRegionsForConflict(conflictName, countries, events);
    if (regions.length > 0) {
      result[conflictName] = regions;
      total++;
      const eventSum = regions.reduce((s, r) => s + r.eventCount, 0);
      console.log(`  ${conflictName}: ${regions.length} regions, ${eventSum} events`);
    }
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n[Export] Done. ${total} conflicts with regions → ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
