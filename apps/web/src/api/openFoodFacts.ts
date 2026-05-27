// ── Open Food Facts — barcode lookup only ────────────────────────────────────
// OFF is used exclusively for barcode scanning. Food text-search uses USDA below.

const OFF_BASE  = 'https://world.openfoodfacts.org';
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
const USDA_KEY  = 'DEMO_KEY'; // 1 000 req/hr free — enough for personal use

export interface OFFProduct {
  name: string;
  brand: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSizeG: number | null;
  imageUrl: string | null;
  barcode?: string;
  fiberPer100g?: number | null;
  cholesterolPer100g?: number | null;
  sodiumPer100g?: number | null;
  vitaminCPer100g?: number | null;
  vitaminDPer100g?: number | null;
  calciumPer100g?: number | null;
  ironPer100g?: number | null;
}

// ── USDA parser ───────────────────────────────────────────────────────────────
function parseServingSize(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+\.?\d*)\s*(g|ml)/i);
  return m ? parseFloat(m[1]) : null;
}

interface USDAFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: Array<{ nutrientName: string; unitName: string; value: number }>;
}

function parseUSDA(f: USDAFood): OFFProduct | null {
  const nuts = new Map<string, number>();
  for (const n of f.foodNutrients) {
    if (!nuts.has(n.nutrientName) || n.unitName === 'KCAL' || n.unitName === 'G') {
      nuts.set(n.nutrientName, n.value ?? 0);
    }
  }
  // Energy: prefer KCAL entry, fall back to kJ÷4.184
  let cal = f.foodNutrients.find((n) => n.nutrientName === 'Energy' && n.unitName === 'KCAL')?.value;
  if (cal == null) {
    const kj = f.foodNutrients.find((n) => n.nutrientName === 'Energy' && n.unitName === 'kJ')?.value;
    if (kj) cal = kj / 4.184;
  }
  if (cal == null || isNaN(cal)) return null;

  const protein     = nuts.get('Protein') ?? 0;
  const carbs       = nuts.get('Carbohydrate, by difference') ?? 0;
  const fat         = nuts.get('Total lipid (fat)') ?? 0;
  const fiber       = nuts.get('Fiber, total dietary');
  const cholesterol = nuts.get('Cholesterol');
  const sodium      = nuts.get('Sodium, Na');
  const vitaminC    = nuts.get('Vitamin C, total ascorbic acid');
  const vitaminD    = nuts.get('Vitamin D (D2 + D3)');
  const calcium     = nuts.get('Calcium, Ca');
  const iron        = nuts.get('Iron, Fe');

  const servingSizeG =
    f.servingSize && f.servingSizeUnit?.toLowerCase().startsWith('g')
      ? f.servingSize
      : null;

  return {
    name:               f.description,
    brand:              f.brandOwner ?? '',
    caloriesPer100g:    Math.round(cal),
    proteinPer100g:     Math.round(protein * 10) / 10,
    carbsPer100g:       Math.round(Math.max(0, carbs) * 10) / 10,
    fatPer100g:         Math.round(fat * 10) / 10,
    servingSizeG,
    imageUrl:           null,
    fiberPer100g:       fiber       != null ? Math.round(fiber       * 10) / 10 : null,
    cholesterolPer100g: cholesterol != null ? Math.round(cholesterol)           : null,
    sodiumPer100g:      sodium      != null ? Math.round(sodium)                : null,
    vitaminCPer100g:    vitaminC    != null ? Math.round(vitaminC    * 10) / 10 : null,
    vitaminDPer100g:    vitaminD    != null ? Math.round(vitaminD    * 100) / 100 : null,
    calciumPer100g:     calcium     != null ? Math.round(calcium)               : null,
    ironPer100g:        iron        != null ? Math.round(iron        * 100) / 100 : null,
  };
}

// ── AbortSignal.timeout compat (older Android WebView doesn't support it) ──────
function timeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

// ── Public: food search (USDA + OFF fallback) ─────────────────────────────────
export async function searchFood(query: string): Promise<OFFProduct[]> {
  // Try USDA first
  try {
    const url = `${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}&api_key=${USDA_KEY}&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)&pageSize=20&nutrients=1003,1004,1005,1008,1079,1253,1093,1162,1114,1087,1089`;
    const res = await fetch(url, { signal: timeoutSignal(9000) });
    if (res.ok) {
      const data = await res.json() as { foods?: USDAFood[] };
      const results = ((data.foods ?? []) as USDAFood[]).map(parseUSDA).filter(Boolean) as OFFProduct[];
      if (results.length > 0) return results;
    }
  } catch { /* fall through to OFF */ }

  // Fallback: Open Food Facts text search
  try {
    const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20`;
    const res = await fetch(url, { signal: timeoutSignal(9000) });
    if (!res.ok) return [];
    const data = await res.json() as { products?: Record<string, unknown>[] };
    return ((data.products ?? []) as Record<string, unknown>[])
      .map((p) => parseOFF(p))
      .filter(Boolean) as OFFProduct[];
  } catch { return []; }
}

// ── Public: barcode lookup (Open Food Facts) ──────────────────────────────────
function parseOFF(raw: Record<string, unknown>, barcode?: string): OFFProduct | null {
  const n = raw.nutriments as Record<string, number> | undefined;
  if (!n) return null;
  const cal =
    n['energy-kcal_100g'] ??
    n['energy-kcal'] ??
    (n['energy_100g'] ? n['energy_100g'] / 4.184 : null);
  if (cal == null || isNaN(Number(cal))) return null;
  const name = (raw.product_name as string) || (raw.product_name_en as string) || '';
  if (!name.trim()) return null;
  const nn = (key: string) => { const v = n[key]; return v != null ? Number(v) : null; };
  return {
    name:               name.trim(),
    brand:              (raw.brands as string) || '',
    caloriesPer100g:    Math.round(Number(cal)),
    proteinPer100g:     Number(n['proteins_100g'] ?? 0),
    carbsPer100g:       Number(n['carbohydrates_100g'] ?? 0),
    fatPer100g:         Number(n['fat_100g'] ?? 0),
    servingSizeG:       parseServingSize(raw.serving_size as string | undefined),
    imageUrl:           (raw.image_thumb_url as string) || (raw.image_url as string) || null,
    barcode,
    fiberPer100g:       nn('fiber_100g')       ?? nn('dietary-fiber_100g'),
    cholesterolPer100g: nn('cholesterol_100g'),
    sodiumPer100g:      nn('sodium_100g'),
    vitaminCPer100g:    nn('vitamin-c_100g'),
    vitaminDPer100g:    nn('vitamin-d_100g'),
    calciumPer100g:     nn('calcium_100g'),
    ironPer100g:        nn('iron_100g'),
  };
}

export async function lookupBarcode(barcode: string): Promise<OFFProduct | null> {
  const url = `${OFF_BASE}/api/v0/product/${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url, { signal: timeoutSignal(8000) });
  if (!res.ok) return null;
  const data = await res.json() as { status: number; product?: Record<string, unknown> };
  if (data.status !== 1 || !data.product) return null;
  return parseOFF(data.product, barcode);
}
