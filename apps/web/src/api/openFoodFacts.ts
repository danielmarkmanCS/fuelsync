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

  const protein = nuts.get('Protein') ?? 0;
  const carbs   = nuts.get('Carbohydrate, by difference') ?? 0;
  const fat     = nuts.get('Total lipid (fat)') ?? 0;

  const servingSizeG =
    f.servingSize && f.servingSizeUnit?.toLowerCase().startsWith('g')
      ? f.servingSize
      : null;

  return {
    name:            f.description,
    brand:           f.brandOwner ?? '',
    caloriesPer100g: Math.round(cal),
    proteinPer100g:  Math.round(protein * 10) / 10,
    carbsPer100g:    Math.round(Math.max(0, carbs) * 10) / 10,
    fatPer100g:      Math.round(fat * 10) / 10,
    servingSizeG,
    imageUrl:        null,
  };
}

// ── Public: food search (USDA) ────────────────────────────────────────────────
export async function searchFood(query: string): Promise<OFFProduct[]> {
  const url = `${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}&api_key=${USDA_KEY}&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)&pageSize=20&nutrients=1003,1004,1005,1008`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json() as { foods?: USDAFood[] };
  return ((data.foods ?? []) as USDAFood[])
    .map(parseUSDA)
    .filter(Boolean) as OFFProduct[];
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
  return {
    name:            name.trim(),
    brand:           (raw.brands as string) || '',
    caloriesPer100g: Math.round(Number(cal)),
    proteinPer100g:  Number(n['proteins_100g'] ?? 0),
    carbsPer100g:    Number(n['carbohydrates_100g'] ?? 0),
    fatPer100g:      Number(n['fat_100g'] ?? 0),
    servingSizeG:    parseServingSize(raw.serving_size as string | undefined),
    imageUrl:        (raw.image_thumb_url as string) || (raw.image_url as string) || null,
    barcode,
  };
}

export async function lookupBarcode(barcode: string): Promise<OFFProduct | null> {
  const url = `${OFF_BASE}/api/v0/product/${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json() as { status: number; product?: Record<string, unknown> };
  if (data.status !== 1 || !data.product) return null;
  return parseOFF(data.product, barcode);
}
