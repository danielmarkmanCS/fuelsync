interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  SESSION_SECRET: string;
}

function cors(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

// ── Session token: HMAC-SHA256 of "userId:expiresAt" ─────────────────────────

async function signToken(userId: string, expiresAt: number, secret: string): Promise<string> {
  const msg = `${userId}:${expiresAt}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${userId}:${expiresAt}:${hex}`;
}

async function verifyToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split(':');
  if (parts.length < 3) return null;
  const sig = parts.pop()!;
  const expiresAt = Number(parts.pop()!);
  const userId = parts.join(':');
  if (Date.now() > expiresAt) return null;
  const expected = await signToken(userId, expiresAt, secret);
  const expectedSig = expected.split(':').pop()!;
  return sig === expectedSig ? userId : null;
}

// ── Auth middleware ───────────────────────────────────────────────────────────

async function authenticate(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7), env.SESSION_SECRET);
}

// ── Google token verification ─────────────────────────────────────────────────

interface GoogleUser {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

async function verifyGoogleToken(idToken: string): Promise<GoogleUser | null> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
  if (!res.ok) return null;
  const data = await res.json() as Record<string, string>;
  if (!data.sub || !data.email) return null;
  return { sub: data.sub, email: data.email, name: data.name ?? '', picture: data.picture ?? '' };
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '*';
    const allowed = env.ALLOWED_ORIGIN ?? 'https://foodaniel.danielmms.site';
    const ao = origin === allowed || origin.startsWith('http://localhost') ? origin : allowed;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(ao) });

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ── POST /auth/google ─────────────────────────────────────────────────
      if (path === '/auth/google' && request.method === 'POST') {
        const { id_token } = await request.json() as { id_token: string };
        if (!id_token) return err('id_token required', 400, ao);

        const gUser = await verifyGoogleToken(id_token);
        if (!gUser) return err('Invalid Google token', 401, ao);

        // Upsert user
        await env.DB.prepare(`
          INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture
        `).bind(gUser.sub, gUser.email, gUser.name, gUser.picture).run();

        // Upsert profile row if not exists
        await env.DB.prepare(`
          INSERT OR IGNORE INTO profiles (user_id, display_name) VALUES (?, ?)
        `).bind(gUser.sub, gUser.name.split(' ')[0]).run();

        // Create session token (30-day expiry)
        const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const token = await signToken(gUser.sub, expiresAt, env.SESSION_SECRET);

        // Load profile
        const profile = await env.DB.prepare('SELECT * FROM profiles WHERE user_id = ?')
          .bind(gUser.sub).first<Record<string, unknown>>();

        return json({ token, user: { ...gUser, ...profile } }, 200, ao);
      }

      // ── GET /auth/me ──────────────────────────────────────────────────────
      if (path === '/auth/me' && request.method === 'GET') {
        const userId = await authenticate(request, env);
        if (!userId) return err('Unauthorized', 401, ao);

        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<Record<string, unknown>>();
        const profile = await env.DB.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(userId).first<Record<string, unknown>>();
        if (!user) return err('User not found', 404, ao);

        return json({ ...user, ...profile }, 200, ao);
      }

      // ── PUT /profile ──────────────────────────────────────────────────────
      if (path === '/profile' && request.method === 'PUT') {
        const userId = await authenticate(request, env);
        if (!userId) return err('Unauthorized', 401, ao);

        const body = await request.json() as Record<string, unknown>;
        await env.DB.prepare(`
          INSERT INTO profiles (user_id, display_name, weight_kg, height_cm, age, gender, activity_level, daily_goal,
            strava_access_token, strava_refresh_token, strava_expires_at, strava_athlete_name, strava_athlete_pic, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            display_name=excluded.display_name, weight_kg=excluded.weight_kg,
            height_cm=excluded.height_cm, age=excluded.age, gender=excluded.gender,
            activity_level=excluded.activity_level, daily_goal=excluded.daily_goal,
            strava_access_token=COALESCE(excluded.strava_access_token, strava_access_token),
            strava_refresh_token=COALESCE(excluded.strava_refresh_token, strava_refresh_token),
            strava_expires_at=COALESCE(excluded.strava_expires_at, strava_expires_at),
            strava_athlete_name=COALESCE(excluded.strava_athlete_name, strava_athlete_name),
            strava_athlete_pic=COALESCE(excluded.strava_athlete_pic, strava_athlete_pic),
            updated_at=excluded.updated_at
        `).bind(
          userId, body.display_name ?? null, body.weight_kg ?? null, body.height_cm ?? null,
          body.age ?? null, body.gender ?? null, body.activity_level ?? 'moderate', body.daily_goal ?? 2000,
          body.strava_access_token ?? null, body.strava_refresh_token ?? null,
          body.strava_expires_at ?? null, body.strava_athlete_name ?? null, body.strava_athlete_pic ?? null,
        ).run();

        const profile = await env.DB.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(userId).first();
        return json(profile, 200, ao);
      }

      // ── GET /logs?date=YYYY-MM-DD ─────────────────────────────────────────
      if (path === '/logs' && request.method === 'GET') {
        const userId = await authenticate(request, env);
        if (!userId) return err('Unauthorized', 401, ao);

        const date = url.searchParams.get('date');
        const all  = url.searchParams.get('all');

        let rows;
        if (all) {
          rows = await env.DB.prepare(
            'SELECT * FROM food_logs WHERE user_id = ? AND deleted_at IS NULL ORDER BY logged_at DESC'
          ).bind(userId).all();
        } else if (date) {
          rows = await env.DB.prepare(
            'SELECT * FROM food_logs WHERE user_id = ? AND date = ? AND deleted_at IS NULL ORDER BY logged_at ASC'
          ).bind(userId, date).all();
        } else {
          return err('date or all param required', 400, ao);
        }

        const logs = (rows.results ?? []).map((r: Record<string, unknown>) => ({
          ...r,
          ingredients: r.ingredients ? JSON.parse(r.ingredients as string) : null,
        }));
        return json(logs, 200, ao);
      }

      // ── POST /logs ────────────────────────────────────────────────────────
      if (path === '/logs' && request.method === 'POST') {
        const userId = await authenticate(request, env);
        if (!userId) return err('Unauthorized', 401, ao);

        const body = await request.json() as Record<string, unknown>;
        if (!body.id || !body.food_name || body.calories == null) return err('id, food_name, calories required', 400, ao);

        await env.DB.prepare(`
          INSERT INTO food_logs (id, user_id, food_name, calories, protein, carbs, fat, weight_grams, meal_type, image_url, ingredients, logged_at, date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id, user_id) DO UPDATE SET
            food_name=excluded.food_name, calories=excluded.calories, protein=excluded.protein,
            carbs=excluded.carbs, fat=excluded.fat, weight_grams=excluded.weight_grams,
            meal_type=excluded.meal_type, image_url=excluded.image_url, ingredients=excluded.ingredients,
            logged_at=excluded.logged_at, date=excluded.date, deleted_at=NULL
        `).bind(
          body.id, userId, body.food_name, body.calories, body.protein ?? 0, body.carbs ?? 0, body.fat ?? 0,
          body.weight_grams ?? null, body.meal_type ?? 'other', body.image_url ?? null,
          body.ingredients ? JSON.stringify(body.ingredients) : null,
          body.logged_at, body.date,
        ).run();

        return json({ ok: true }, 200, ao);
      }

      // ── DELETE /logs/:id ──────────────────────────────────────────────────
      if (path.startsWith('/logs/') && request.method === 'DELETE') {
        const userId = await authenticate(request, env);
        if (!userId) return err('Unauthorized', 401, ao);

        const id = path.slice(6);
        await env.DB.prepare(
          `UPDATE food_logs SET deleted_at = datetime('now') WHERE id = ? AND user_id = ?`
        ).bind(id, userId).run();

        return json({ ok: true }, 200, ao);
      }

      // ── DELETE /account ───────────────────────────────────────────────────
      if (path === '/account' && request.method === 'DELETE') {
        const userId = await authenticate(request, env);
        if (!userId) return err('Unauthorized', 401, ao);

        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
        return json({ ok: true }, 200, ao);
      }

      return err('Not found', 404, ao);
    } catch (e: unknown) {
      console.error(e);
      return err(e instanceof Error ? e.message : 'Server error', 500, ao);
    }
  },
};
