import axios from 'axios';
import type { Conflict } from '../types/index.js';

const TOKEN_URL = 'https://acleddata.com/oauth/token';
const API_BASE = 'https://acleddata.com/api/acled/read';
const VIOLENT_EVENT_TYPES = ['Battles', 'Explosions/Remote violence', 'Violence against civilians'];
const MAX_REGIONS_PER_CONFLICT = 15;
const LOOKBACK_DAYS = 365;
const PAGE_LIMIT = 5000;

interface AcledToken {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
}

let cachedToken: AcledToken | null = null;

async function getAccessToken(): Promise<string> {
  const email = process.env.ACLED_EMAIL;
  const password = process.env.ACLED_PASSWORD;
  if (!email || !password) {
    throw new Error('ACLED_EMAIL and ACLED_PASSWORD environment variables are required');
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const params = new URLSearchParams();
  if (cachedToken?.refreshToken) {
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', cachedToken.refreshToken);
  } else {
    params.set('username', email);
    params.set('password', password);
    params.set('grant_type', 'password');
  }
  params.set('client_id', 'acled');

  const resp = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  cachedToken = {
    accessToken: resp.data.access_token,
    expiresAt: Date.now() + resp.data.expires_in * 1000,
    refreshToken: resp.data.refresh_token,
  };
  return cachedToken.accessToken;
}

interface AcledEvent {
  event_type: string;
  country: string;
  admin1: string;
  location: string;
  latitude: string;
  longitude: string;
  fatalities: string;
}

async function fetchEvents(countries: string[]): Promise<AcledEvent[]> {
  const token = await getAccessToken();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  const sinceStr = since.toISOString().slice(0, 10);

  const countryFilter = countries.join('|');
  const eventTypeFilter = VIOLENT_EVENT_TYPES.join('|');

  const allEvents: AcledEvent[] = [];
  let page = 1;

  while (true) {
    const resp = await axios.get(API_BASE, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        _format: 'json',
        country: countryFilter,
        event_type: eventTypeFilter,
        event_date: `${sinceStr}|${new Date().toISOString().slice(0, 10)}`,
        event_date_where: 'BETWEEN',
        fields: 'event_type|country|admin1|location|latitude|longitude|fatalities',
        limit: PAGE_LIMIT,
        page,
      },
    });

    const events: AcledEvent[] = resp.data?.data ?? [];
    if (events.length === 0) break;
    allEvents.push(...events);
    if (events.length < PAGE_LIMIT) break;
    page++;
  }

  return allEvents;
}

export interface AffectedRegion {
  name: string;
  lat: number;
  lng: number;
  eventCount: number;
}

function aggregateByAdmin1(events: AcledEvent[]): AffectedRegion[] {
  const groups = new Map<string, { lats: number[]; lngs: number[]; count: number }>();

  for (const ev of events) {
    const lat = parseFloat(ev.latitude);
    const lng = parseFloat(ev.longitude);
    if (isNaN(lat) || isNaN(lng)) continue;

    const key = `${ev.country}::${ev.admin1 || ev.location}`;
    const g = groups.get(key);
    if (g) {
      g.lats.push(lat);
      g.lngs.push(lng);
      g.count++;
    } else {
      groups.set(key, { lats: [lat], lngs: [lng], count: 1 });
    }
  }

  const regions: AffectedRegion[] = [];
  for (const [key, g] of groups) {
    const name = key.split('::')[1] || key;
    const lat = g.lats.reduce((a, b) => a + b, 0) / g.lats.length;
    const lng = g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length;
    regions.push({ name, lat, lng, eventCount: g.count });
  }

  regions.sort((a, b) => b.eventCount - a.eventCount);
  return regions.slice(0, MAX_REGIONS_PER_CONFLICT);
}

const ACLED_COUNTRY_ALIASES: Record<string, string> = {
  'Myanmar': 'Myanmar/Burma',
  'Ivory Coast': 'Ivory Coast (Cote D\'Ivoire)',
  'Democratic Republic of the Congo': 'Democratic Republic of Congo',
  'Sahrawi Republic': 'Western Sahara',
  'Palestine': 'Palestine',
};

function resolveAcledCountryName(name: string): string {
  return ACLED_COUNTRY_ALIASES[name] || name;
}

export async function enrichConflictWithAcled(conflict: Conflict): Promise<AffectedRegion[]> {
  const acledCountries = conflict.countries.map(resolveAcledCountryName);

  try {
    const events = await fetchEvents(acledCountries);
    if (events.length === 0) return [];
    return aggregateByAdmin1(events);
  } catch (err) {
    console.warn(`[ACLED] Failed to enrich "${conflict.name}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function enrichAllConflicts(conflicts: Conflict[]): Promise<void> {
  const email = process.env.ACLED_EMAIL;
  const password = process.env.ACLED_PASSWORD;
  if (!email || !password) {
    console.log('[ACLED] ACLED_EMAIL/ACLED_PASSWORD not set, skipping enrichment');
    return;
  }

  console.log(`[ACLED] Enriching ${conflicts.length} conflicts with ACLED event data...`);
  let enriched = 0;

  for (const conflict of conflicts) {
    const regions = await enrichConflictWithAcled(conflict);
    if (regions.length > 0) {
      (conflict as any).affectedRegions = regions;
      enriched++;
      console.log(`[ACLED]   ${conflict.name}: ${regions.length} regions (${regions.reduce((s, r) => s + r.eventCount, 0)} events)`);
    }
  }

  console.log(`[ACLED] Enrichment complete. ${enriched}/${conflicts.length} conflicts enriched.`);
}
