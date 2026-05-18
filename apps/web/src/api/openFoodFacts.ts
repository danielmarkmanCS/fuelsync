const BASE = 'https://world.openfoodfacts.org';

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

function parseServingSize(s: string | undefined): number | null {
  if (!s) return null;
  const match = s.match(/(\d+\.?\d*)\s*(g|ml)/i);
  return match ? parseFloat(match[1]) : null;
}

function parseProduct(raw: Record<string, unknown>, barcode?: string): OFFProduct | null {
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
    name:             name.trim(),
    brand:            (raw.brands as string) || '',
    caloriesPer100g:  Math.round(Number(cal)),
    proteinPer100g:   Number(n['proteins_100g'] ?? 0),
    carbsPer100g:     Number(n['carbohydrates_100g'] ?? 0),
    fatPer100g:       Number(n['fat_100g'] ?? 0),
    servingSizeG:     parseServingSize(raw.serving_size as string | undefined),
    imageUrl:         (raw.image_thumb_url as string) || (raw.image_url as string) || null,
    barcode,
  };
}

export async function searchFood(query: string): Promise<OFFProduct[]> {
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=15&fields=product_name,product_name_en,brands,nutriments,serving_size,image_thumb_url`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json() as { products?: unknown[] };
  return ((data.products ?? []) as Record<string, unknown>[])
    .map((p) => parseProduct(p))
    .filter(Boolean) as OFFProduct[];
}

export async function lookupBarcode(barcode: string): Promise<OFFProduct | null> {
  const url = `${BASE}/api/v0/product/${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json() as { status: number; product?: Record<string, unknown> };
  if (data.status !== 1 || !data.product) return null;
  return parseProduct(data.product, barcode);
}
