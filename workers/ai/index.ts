// Model cascade — tries each in order, skips on 429/404, errors only if all exhausted
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite'];


interface Env {
  GEMINI_API_KEY: string;
  GEMINI_API_KEY_2?: string;
  GEMINI_API_KEY_3?: string;
  ALLOWED_ORIGIN: string;
  DANMAP_TOKEN?: string;
}

function cors(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

async function geminiWithModel(apiKey: string, model: string, prompt: string, maxTokens = 512, imageBase64?: string, imageMime?: string): Promise<{ text: string; status: number }> {
  const parts: unknown[] = [];
  if (imageBase64 && imageMime) {
    parts.push({ inlineData: { mimeType: imageMime, data: imageBase64 } });
  }
  parts.push({ text: prompt });

  const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const generationConfig: Record<string, unknown> = { temperature: 0.1, maxOutputTokens: maxTokens };
  if (model.startsWith('gemini-2.5-')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const res = await fetch(`${base}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig }),
  });

  if (res.status === 401 || res.status === 403) throw new Error('Invalid Gemini API key.');
  if (res.status === 429 || res.status === 404) return { text: '', status: res.status };
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);

  const data = await res.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }> };
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '', status: 200 };
}

async function gemini(keys: string[], prompt: string, maxTokens = 512, imageBase64?: string, imageMime?: string): Promise<string> {
  for (const apiKey of keys) {
    for (const model of GEMINI_MODELS) {
      const result = await geminiWithModel(apiKey, model, prompt, maxTokens, imageBase64, imageMime);
      if (result.status !== 429 && result.status !== 404) return result.text;
    }
  }
  throw new Error('AI daily limit reached across all keys. Resets at midnight Pacific time.');
}

function parseJSON(text: string): unknown {
  try { return JSON.parse(text); } catch { /* try markdown extraction */ }
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch { /* fall through */ } }
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch { /* fall through */ } }
  throw new Error('Could not parse AI response as JSON');
}

const MACRO_SCHEMA = `Respond ONLY with valid JSON:
{"food_name":"string","estimated_weight_grams":number,"calories":number,"protein":number,"carbs":number,"fat":number,"fiber_g":number,"cholesterol_mg":number,"sodium_mg":number,"vitamin_c_mg":number,"vitamin_d_mcg":number,"calcium_mg":number,"iron_mg":number,"confidence":"high"|"medium"|"low","ingredients":[{"name":"string","amount":"string","calories":number,"protein":number,"carbs":number,"fat":number}]}
micronutrients are for the total meal (not per ingredient). ingredients: every separate food item/component with its own realistic macros and a human-readable amount (e.g. "2 large eggs", "150g", "1 tbsp olive oil"). If it's a single-ingredient food, still wrap it in the ingredients array.`;

const SUGGEST_SCHEMA = `Respond ONLY with valid JSON:
{"food_name":"string","estimated_weight_grams":number,"calories":number,"protein":number,"carbs":number,"fat":number,"fiber_g":number,"cholesterol_mg":number,"sodium_mg":number,"vitamin_c_mg":number,"vitamin_d_mcg":number,"calcium_mg":number,"iron_mg":number,"confidence":"high","ingredients":[{"name":"string","amount":"string","calories":number,"protein":number,"carbs":number,"fat":number}]}
micronutrients are for the total meal. ingredients: every item with its exact amount and individual macros. Be specific and practical.`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '*';
    const allowed = env.ALLOWED_ORIGIN ?? 'https://foodaniel.danielmms.site';
    const allowedOrigin = origin === allowed || origin.startsWith('http://localhost') || origin === 'capacitor://localhost' || origin === 'https://localhost' ? origin : allowed;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(allowedOrigin) });
    }
    if (request.method !== 'POST') return err('Method not allowed', 405, allowedOrigin);

    const apiKeys = [env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3].filter(Boolean) as string[];

    const url = new URL(request.url);
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { return err('Invalid JSON body', 400, allowedOrigin); }

    try {
      if (url.pathname.endsWith('/estimate')) {
        const { food_name, weight_grams } = body;
        if (!food_name || !weight_grams) return err('food_name and weight_grams required', 400, allowedOrigin);
        const prompt = `For ${weight_grams}g of "${food_name}", give exact nutritional values.\n${MACRO_SCHEMA}`;
        const text = await gemini(apiKeys, prompt, 768);
        return json(parseJSON(text), 200, allowedOrigin);
      }

      if (url.pathname.endsWith('/describe')) {
        const { description } = body;
        if (!description) return err('description required', 400, allowedOrigin);
        const prompt = `Analyse this meal and provide nutritional breakdown: "${description}"\n${MACRO_SCHEMA}`;
        const text = await gemini(apiKeys, prompt, 1024);
        return json(parseJSON(text), 200, allowedOrigin);
      }

      if (url.pathname.endsWith('/suggest')) {
        const { context, size } = body;
        if (!context) return err('context required', 400, allowedOrigin);
        const sizeLabel = size === 'small' ? 'light snack or small' : 'complete';
        const prompt = `Suggest a specific, practical ${sizeLabel} meal for an athlete for: ${context}. Include exact food items with realistic portions.\n${SUGGEST_SCHEMA}`;
        const text = await gemini(apiKeys, prompt, 1024);
        return json(parseJSON(text), 200, allowedOrigin);
      }

      if (url.pathname.endsWith('/analyze')) {
        const { base64, mimeType } = body;
        if (!base64 || !mimeType) return err('base64 and mimeType required', 400, allowedOrigin);
        const prompt = `Identify the food(s) in this image and estimate total nutritional values.\n${MACRO_SCHEMA}`;
        const text = await gemini(apiKeys, prompt, 1024, base64 as string, mimeType as string);
        return json(parseJSON(text), 200, allowedOrigin);
      }

      if (url.pathname.endsWith('/steps')) {
        const { description } = body;
        if (!description) return err('description required', 400, allowedOrigin);
        const prompt = `Estimate total daily steps for: "${description}".
Base steps by job: desk/office ≈ 3000-5000, standing/retail ≈ 7000-10000, field/delivery ≈ 15000+. Add for activities: 30min walk ≈ +3500, 5km run ≈ +6500, 1hr gym ≈ +2000, cycling doesn't count as steps.
Respond ONLY with valid JSON (no other text): {"steps":number,"label":"low"|"normal"|"high"} — low<6000, normal 6000-10000, high>10000.`;
        const text = await gemini(apiKeys, prompt, 64);
        return json(parseJSON(text), 200, allowedOrigin);
      }

      if (url.pathname.endsWith('/weekly-summary')) {
        const { days, avgCalories, avgProtein, avgCarbs, avgFat, targetCalories, targetProtein, trainingTypes, totalRunKm, totalStrengthSessions, streak } = body;
        const prompt = `You are a sports nutritionist coach. Analyze this athlete's past 7 days and write a short, motivating, data-driven weekly summary.

DATA:
- Logged days: ${days}/7 (streak: ${streak} days)
- Avg daily: ${avgCalories} kcal | P ${avgProtein}g | C ${avgCarbs}g | F ${avgFat}g
- Targets: ${targetCalories} kcal | Protein ${targetProtein}g
- Training: ${trainingTypes} (run: ${totalRunKm}km, strength: ${totalStrengthSessions} sessions)

Write 3 short sections (2-3 sentences each):
1. "What went well" — celebrate real wins from the data
2. "What to watch" — one or two honest gaps (under-eating protein? skipped days?)
3. "This week's focus" — one concrete, actionable recommendation

Keep it coach-like, direct, no fluff. No markdown. No bullet points. Just plain text paragraphs.

Respond ONLY with valid JSON: {"well":"string","watch":"string","focus":"string"}`;
        const text = await gemini(apiKeys, prompt, 512);
        return json(parseJSON(text), 200, allowedOrigin);
      }

      // ── danmap security analysis ──────────────────────────────────────
      // Called by the danmap CLI tool. Protected by DANMAP_TOKEN secret.
      // Accepts: { scan: string } — plain-text port scan summary
      // Returns: { analysis: string }
      if (url.pathname.endsWith('/security-analyze')) {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (env.DANMAP_TOKEN && token !== env.DANMAP_TOKEN) {
          return err('Unauthorized', 401, allowedOrigin);
        }
        const { scan } = body;
        if (!scan) return err('scan required', 400, allowedOrigin);
        const prompt = `You are a cybersecurity expert. Analyze this port scan and respond in EXACTLY this format:

RISK: [LOW / MEDIUM / HIGH / CRITICAL]

FINDINGS:
• [one line per notable port or issue]

RECOMMENDATIONS:
1. [specific action]
2. [specific action]

Keep it short and actionable. Scan results:

${scan}`;
        const text = await gemini(apiKeys, prompt, 512);
        return json({ analysis: text }, 200, allowedOrigin);
      }

      return err('Not found', 404, allowedOrigin);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'AI request failed';
      return err(msg, 500, allowedOrigin);
    }
  },
};
