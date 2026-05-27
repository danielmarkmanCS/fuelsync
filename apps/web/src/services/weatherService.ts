import type { WeatherConditions, EnvironmentAlert, TrainingType } from '../../../../shared/types';

const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

// ─── THRESHOLDS ───────────────────────────────────────────────────────────────

const THRESHOLDS = {
  highTemp: 30,       // °C
  dangerTemp: 36,     // °C
  highHumidity: 80,   // %
  dangerHumidity: 90, // %
  highUV: 8,
} as const;

// ─── FETCH ────────────────────────────────────────────────────────────────────

export async function fetchWeather(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<WeatherConditions> {
  const url = `${BASE_URL}?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  const data = await res.json();

  return {
    tempC: data.main.temp,
    humidity: data.main.humidity,
    uvIndex: data.current?.uvi ?? 0, // available in One Call API
    description: data.weather[0]?.description ?? '',
    city: data.name,
    timestamp: Date.now(),
  };
}

// ─── ENVIRONMENT ALERT ────────────────────────────────────────────────────────

export function evaluateEnvironment(
  weather: WeatherConditions,
  plannedType: TrainingType,
): EnvironmentAlert {
  const { tempC, humidity, uvIndex } = weather;

  const isHot = tempC >= THRESHOLDS.highTemp;
  const isDangerHot = tempC >= THRESHOLDS.dangerTemp;
  const isHumid = humidity >= THRESHOLDS.highHumidity;
  const isDangerHumid = humidity >= THRESHOLDS.dangerHumidity;
  const isHighUV = uvIndex >= THRESHOLDS.highUV;

  // No risk
  if (!isHot && !isHumid && !isHighUV) {
    return { level: 'none', message: 'Conditions are good for outdoor training.' };
  }

  // Danger tier
  if (isDangerHot || isDangerHumid) {
    return {
      level: 'danger',
      message: `Extreme conditions: ${tempC}°C / ${humidity}% humidity. Outdoor training is not recommended.`,
      suggestedPivot: 'strength',
      pivotReason: 'Switch to indoor AC gym. Swap cardio leg work for upper-body strength to protect your run later this week.',
      extraHydrationMl: 1000,
    };
  }

  // Caution tier — suggest modifications rather than full swap
  const cautions: string[] = [];
  if (isHot) cautions.push(`${tempC}°C heat`);
  if (isHumid) cautions.push(`${humidity}% humidity`);
  if (isHighUV) cautions.push(`UV index ${uvIndex}`);

  const pivotNeeded = plannedType === 'cardio' && (isHot || isHumid);

  return {
    level: 'caution',
    message: `Caution: ${cautions.join(', ')}. Adjust pace +15 sec/km and increase hydration.`,
    suggestedPivot: pivotNeeded ? 'strength' : undefined,
    pivotReason: pivotNeeded
      ? 'Consider swapping today\'s run for indoor strength (upper body only) and reschedule cardio to a cooler slot this week.'
      : undefined,
    extraHydrationMl: isHumid ? 600 : 400,
  };
}

// ─── WEEKLY SCHEDULE PIVOT ────────────────────────────────────────────────────
// Returns a suggested swap for a 7-day schedule given a blocked day.

export function suggestWeeklyPivot(
  blockedDay: string, // YYYY-MM-DD
  schedule: Record<string, TrainingType>,
): Record<string, TrainingType> {
  const days = Object.keys(schedule).sort();
  const blockedIdx = days.indexOf(blockedDay);
  if (blockedIdx === -1) return schedule;

  const updated = { ...schedule };
  const blocked = updated[blockedDay];

  // Find the nearest rest day or lower-intensity day to swap with
  for (let i = 1; i <= 3; i++) {
    const candidateIdx = blockedIdx + i;
    if (candidateIdx >= days.length) break;
    const candidate = days[candidateIdx];
    if (updated[candidate] === 'rest' || updated[candidate] === 'strength') {
      updated[blockedDay] = updated[candidate];
      updated[candidate] = blocked;
      break;
    }
  }

  return updated;
}
