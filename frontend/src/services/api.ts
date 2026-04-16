import axios from 'axios';
import type { Conflict, StatsResponse } from '../types';

const BASE_URL = '/api';

export async function fetchConflicts(): Promise<Conflict[]> {
  const { data } = await axios.get<Conflict[]>(`${BASE_URL}/conflicts`);
  return data;
}

export async function fetchStats(): Promise<StatsResponse> {
  const { data } = await axios.get<StatsResponse>(`${BASE_URL}/stats`);
  return data;
}
