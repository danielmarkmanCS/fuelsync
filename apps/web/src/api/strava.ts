import { api } from './client';

export interface StravaRun {
  id: number;
  name: string;
  date: string;
  distanceKm: number;
  duration: string;
  pace: string;
  elevationM: number;
  hrAvg: number | null;
}

export interface StravaStats {
  connected: true;
  athlete: { name: string; pic: string | null };
  weekly: { runs: number; km: number; duration: string };
  ytd:    { runs: number; km: number };
  allTime:{ runs: number; km: number };
  recentRuns: StravaRun[];
}

export type StravaData = StravaStats | { connected: false };

export const getStravaAuthUrl = () => api.get<{ url: string }>('/strava/auth-url');
export const connectStrava    = (code: string) => api.post<{ connected: boolean; athlete: { name: string; pic: string } }>('/strava/connect', { code });
export const getStravaStats   = () => api.get<StravaData>('/strava/stats');
export const disconnectStrava = () => api.delete<{ connected: false }>('/strava/disconnect');
