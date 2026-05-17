import { db } from '../lib/db';
import { workerGet, workerPost } from './client';
import { syncProfile } from './syncClient';

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

async function getProfile() {
  const rows = await db.profile.toArray();
  return rows[0] ?? null;
}

async function updateStravaTokens(tokens: {
  stravaAccessToken: string;
  stravaRefreshToken: string;
  stravaExpiresAt: number;
  stravaAthleteName?: string;
  stravaAthletePic?: string;
}) {
  const rows = await db.profile.toArray();
  if (!rows[0]?.id) return;
  await db.profile.update(rows[0].id, tokens);
}

async function refreshIfNeeded(): Promise<string | null> {
  const profile = await getProfile();
  if (!profile?.stravaAccessToken) return null;
  if (profile.stravaExpiresAt && Date.now() / 1000 < profile.stravaExpiresAt - 60) {
    return profile.stravaAccessToken;
  }
  if (!profile.stravaRefreshToken) return null;
  try {
    const res = await workerPost<{ access_token: string; refresh_token: string; expires_at: number }>(
      'strava', '/refresh', { refresh_token: profile.stravaRefreshToken }
    );
    await updateStravaTokens({
      stravaAccessToken: res.access_token,
      stravaRefreshToken: res.refresh_token,
      stravaExpiresAt: res.expires_at,
      stravaAthleteName: profile.stravaAthleteName,
      stravaAthletePic: profile.stravaAthletePic,
    });
    syncProfile({
      strava_access_token: res.access_token,
      strava_refresh_token: res.refresh_token,
      strava_expires_at: res.expires_at,
      strava_athlete_name: profile.stravaAthleteName,
      strava_athlete_pic: profile.stravaAthletePic,
    }).catch(() => {});
    return res.access_token;
  } catch {
    return null;
  }
}

export async function getStravaAuthUrl(): Promise<{ url: string }> {
  return workerGet<{ url: string }>('strava', '/auth-url');
}

// Called by App.tsx after Strava Worker redirects back with tokens in URL params
export async function connectStrava(tokens: {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete_name: string;
  athlete_pic: string;
}): Promise<{ connected: boolean; athlete: { name: string; pic: string } }> {
  await updateStravaTokens({
    stravaAccessToken: tokens.access_token,
    stravaRefreshToken: tokens.refresh_token,
    stravaExpiresAt: tokens.expires_at,
    stravaAthleteName: tokens.athlete_name,
    stravaAthletePic: tokens.athlete_pic,
  });
  syncProfile({
    strava_access_token: tokens.access_token,
    strava_refresh_token: tokens.refresh_token,
    strava_expires_at: tokens.expires_at,
    strava_athlete_name: tokens.athlete_name,
    strava_athlete_pic: tokens.athlete_pic,
  }).catch(() => {});
  return { connected: true, athlete: { name: tokens.athlete_name, pic: tokens.athlete_pic } };
}

export async function getStravaStats(): Promise<StravaData> {
  const access_token = await refreshIfNeeded();
  if (!access_token) return { connected: false };
  return workerPost<StravaData>('strava', '/stats', { access_token });
}

export async function disconnectStrava(): Promise<{ connected: false }> {
  const rows = await db.profile.toArray();
  if (rows[0]?.id) {
    await db.profile.update(rows[0].id, {
      stravaAccessToken: undefined,
      stravaRefreshToken: undefined,
      stravaExpiresAt: undefined,
      stravaAthleteName: undefined,
      stravaAthletePic: undefined,
    });
  }
  return { connected: false };
}
