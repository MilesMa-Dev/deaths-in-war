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
}

export interface StatsResponse {
  totalDeaths: number;
  totalConflicts: number;
  byIntensity: Record<string, number>;
  lastUpdated: string;
}
