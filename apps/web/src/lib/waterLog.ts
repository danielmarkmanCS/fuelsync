import { db } from './db';

const GOAL_KEY = 'fs_water_goal_ml';
const DEFAULT_GOAL = 2500;

export function getWaterGoal(): number {
  try { return parseInt(localStorage.getItem(GOAL_KEY) ?? String(DEFAULT_GOAL), 10) || DEFAULT_GOAL; }
  catch { return DEFAULT_GOAL; }
}

export function setWaterGoal(ml: number) {
  localStorage.setItem(GOAL_KEY, String(ml));
}

export async function getWaterTotal(date: string): Promise<number> {
  const logs = await db.water_logs.where('date').equals(date).toArray();
  return logs.reduce((s, l) => s + l.ml, 0);
}

export async function addWater(date: string, ml: number, note?: string): Promise<void> {
  await db.water_logs.add({ date, ml, note: note ?? null, logged_at: new Date().toISOString() });
}

// Parse natural language like "3 glasses", "500ml", "1 bottle", "coffee", "protein shake"
export function parseWaterDescription(text: string): { ml: number; label: string } | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;

  const DRINK_ML: [RegExp, number, string][] = [
    [/protein shake/,         400, 'Protein shake'],
    [/coffee|espresso/,       200, 'Coffee'],
    [/tea/,                   250, 'Tea'],
    [/juice/,                 250, 'Juice'],
    [/bottle/,                500, 'Bottle'],
    [/cup/,                   250, 'Cup'],
    [/glass(es)?/,            250, 'Glass'],
  ];

  // Match "N glasses", "2 cups", etc.
  const countMatch = t.match(/(\d+(?:\.\d+)?)\s*(glass(?:es)?|cup|bottle|can)/);
  if (countMatch) {
    const count = parseFloat(countMatch[1]);
    const unit  = countMatch[2];
    const mlPer = unit.startsWith('glass') ? 250 : unit === 'cup' ? 250 : unit === 'bottle' ? 500 : 330;
    return { ml: Math.round(count * mlPer), label: `${countMatch[1]} ${unit}` };
  }

  // Match ml/L directly: "500ml", "1.5l"
  const mlMatch = t.match(/(\d+(?:\.\d+)?)\s*ml/);
  if (mlMatch) return { ml: Math.round(parseFloat(mlMatch[1])), label: `${mlMatch[1]}ml` };
  const lMatch  = t.match(/(\d+(?:\.\d+)?)\s*l\b/);
  if (lMatch)  return { ml: Math.round(parseFloat(lMatch[1]) * 1000), label: `${lMatch[1]}L` };

  // Named drinks
  for (const [re, ml, label] of DRINK_ML) {
    if (re.test(t)) return { ml, label };
  }

  return null;
}

export async function parseWaterAI(description: string): Promise<{ ml: number; label: string }> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a hydration tracker. The user describes what they drank. Extract the TOTAL ml of liquid consumed and give it a short label (max 5 words). Respond ONLY with valid JSON, no markdown: {"ml": <integer>, "label": "<string>"}\n\nExamples:\n- "walked to class with a bottle, 2 glasses of water and a coffee" → {"ml":1200,"label":"Bottle + 2 glasses + coffee"}\n- "protein shake and tea" → {"ml":650,"label":"Protein shake + tea"}\n- "just a sip" → {"ml":50,"label":"Small sip"}\n\nUser: "${description}"`,
          }],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 64 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error('No JSON in response');
  const parsed = JSON.parse(match[0]) as { ml: number; label: string };
  return { ml: Math.max(1, Math.min(5000, Math.round(parsed.ml))), label: parsed.label };
}

export async function removeLastWater(date: string): Promise<void> {
  const logs = await db.water_logs.where('date').equals(date).toArray();
  if (logs.length === 0) return;
  const last = logs.sort((a, b) => b.logged_at.localeCompare(a.logged_at))[0];
  await db.water_logs.delete(last.id!);
}

export async function clearWater(date: string): Promise<void> {
  await db.water_logs.where('date').equals(date).delete();
}

export async function getWaterLogs(date: string): Promise<import('./db').WaterLog[]> {
  const logs = await db.water_logs.where('date').equals(date).toArray();
  return logs.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
}

export async function removeWaterById(id: number): Promise<void> {
  await db.water_logs.delete(id);
}
