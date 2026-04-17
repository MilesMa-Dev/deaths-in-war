export interface AffectedRegion {
  name: string;
  lat: number;
  lng: number;
  eventCount: number;
}

export interface Conflict {
  id: string;
  name: string;
  location: string;
  countries: string[];
  coordinates: { lat: number; lng: number };
  startYear: number;
  deathToll: {
    total: number;
    totalDisplay: string;
    recent?: number;
  };
  intensity: 'major_war' | 'war' | 'minor_conflict' | 'skirmish';
  sourceUrl: string;
  lastUpdated: string;
  affectedRegions?: AffectedRegion[];
}

export interface StatsResponse {
  totalDeaths: number;
  totalConflicts: number;
  byIntensity: Record<string, number>;
  lastUpdated: string;
}
