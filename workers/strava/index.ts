interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  APP_URL: string;       // e.g. https://foodaniel.danielmms.site
  WORKER_URL: string;    // e.g. https://fuelsync-strava.<account>.workers.dev
}

function cors(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data: unknown, status = 200, origin = '*'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

function err(msg: string, status = 400, origin = '*'): Response {
  return json({ error: msg }, status, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '*';
    const allowed = env.APP_URL ?? 'https://foodaniel.danielmms.site';
    const allowedOrigin = origin === allowed || origin.startsWith('http://localhost') ? origin : allowed;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(allowedOrigin) });
    }

    const url = new URL(request.url);

    // GET /auth-url — return Strava OAuth URL
    if (url.pathname.endsWith('/auth-url') && request.method === 'GET') {
      const redirectUri = `${env.WORKER_URL}/callback`;
      const stravaUrl = `https://www.strava.com/oauth/authorize?client_id=${env.STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read,activity:read_all`;
      return json({ url: stravaUrl }, 200, allowedOrigin);
    }

    // GET /callback — Strava redirects here after OAuth
    if (url.pathname.endsWith('/callback') && request.method === 'GET') {
      const code  = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error || !code) {
        return Response.redirect(`${env.APP_URL}?strava_error=${error ?? 'cancelled'}`, 302);
      }

      const tokenRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:     env.STRAVA_CLIENT_ID,
          client_secret: env.STRAVA_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        return Response.redirect(`${env.APP_URL}?strava_error=token_exchange_failed`, 302);
      }

      const tokens = await tokenRes.json() as {
        access_token: string;
        refresh_token: string;
        expires_at: number;
        athlete: { firstname: string; lastname: string; profile: string };
      };

      const name = `${tokens.athlete.firstname} ${tokens.athlete.lastname}`.trim();
      const pic  = tokens.athlete.profile ?? '';

      const params = new URLSearchParams({
        strava_access_token:  tokens.access_token,
        strava_refresh_token: tokens.refresh_token,
        strava_expires_at:    String(tokens.expires_at),
        strava_athlete_name:  name,
        strava_athlete_pic:   pic,
      });

      return Response.redirect(`${env.APP_URL}?${params.toString()}`, 302);
    }

    // POST /refresh — exchange refresh token for new access token
    if (url.pathname.endsWith('/refresh') && request.method === 'POST') {
      let body: { refresh_token?: string };
      try { body = await request.json() as { refresh_token?: string }; }
      catch { return err('Invalid JSON', 400, allowedOrigin); }

      if (!body.refresh_token) return err('refresh_token required', 400, allowedOrigin);

      const res = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:     env.STRAVA_CLIENT_ID,
          client_secret: env.STRAVA_CLIENT_SECRET,
          refresh_token: body.refresh_token,
          grant_type:    'refresh_token',
        }),
      });

      if (!res.ok) return err('Token refresh failed', 502, allowedOrigin);
      const data = await res.json() as { access_token: string; refresh_token: string; expires_at: number };
      return json({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at }, 200, allowedOrigin);
    }

    // POST /stats — fetch athlete stats from Strava API
    if (url.pathname.endsWith('/stats') && request.method === 'POST') {
      let body: { access_token?: string };
      try { body = await request.json() as { access_token?: string }; }
      catch { return err('Invalid JSON', 400, allowedOrigin); }

      if (!body.access_token) return err('access_token required', 400, allowedOrigin);

      const headers = { Authorization: `Bearer ${body.access_token}` };

      const [athleteRes, activitiesRes] = await Promise.all([
        fetch('https://www.strava.com/api/v3/athlete', { headers }),
        fetch('https://www.strava.com/api/v3/athlete/activities?per_page=6', { headers }),
      ]);

      if (athleteRes.status === 401) return json({ connected: false }, 200, allowedOrigin);
      if (!athleteRes.ok) return err('Failed to fetch Strava data', 502, allowedOrigin);

      const athlete = await athleteRes.json() as {
        id: number; firstname: string; lastname: string; profile: string;
        stats?: { recent_run_totals: { count: number; distance: number; moving_time: number }; ytd_run_totals: { count: number; distance: number }; all_run_totals: { count: number; distance: number } };
      };

      const statsRes = await fetch(`https://www.strava.com/api/v3/athletes/${athlete.id}/stats`, { headers });
      const stats = statsRes.ok ? await statsRes.json() as { recent_run_totals: { count: number; distance: number; moving_time: number }; ytd_run_totals: { count: number; distance: number }; all_run_totals: { count: number; distance: number } } : null;

      const activities = activitiesRes.ok ? await activitiesRes.json() as Array<{
        id: number; name: string; start_date: string; distance: number; moving_time: number;
        total_elevation_gain: number; average_heartrate?: number; type: string;
      }> : [];

      const runs = activities.filter((a) => a.type === 'Run').map((a) => {
        const km  = Math.round(a.distance / 10) / 100;
        const min = Math.floor(a.moving_time / 60);
        const sec = a.moving_time % 60;
        const pace = km > 0 ? `${Math.floor(a.moving_time / 60 / km)}'${String(Math.round((a.moving_time / km) % 60)).padStart(2, '0')}"` : '—';
        return {
          id: a.id, name: a.name, date: a.start_date,
          distanceKm: km,
          duration: `${min}:${String(sec).padStart(2, '0')}`,
          pace,
          elevationM: Math.round(a.total_elevation_gain),
          hrAvg: a.average_heartrate ? Math.round(a.average_heartrate) : null,
        };
      });

      const weekly = stats?.recent_run_totals ?? { count: 0, distance: 0, moving_time: 0 };
      const weeklyMin = Math.floor(weekly.moving_time / 60);

      return json({
        connected: true,
        athlete: { name: `${athlete.firstname} ${athlete.lastname}`.trim(), pic: athlete.profile ?? null },
        weekly: { runs: weekly.count, km: Math.round(weekly.distance / 10) / 100, duration: `${weeklyMin}min` },
        ytd:    { runs: stats?.ytd_run_totals.count ?? 0, km: Math.round((stats?.ytd_run_totals.distance ?? 0) / 10) / 100 },
        allTime:{ runs: stats?.all_run_totals.count ?? 0, km: Math.round((stats?.all_run_totals.distance ?? 0) / 10) / 100 },
        recentRuns: runs,
      }, 200, allowedOrigin);
    }

    return err('Not found', 404, allowedOrigin);
  },
};
