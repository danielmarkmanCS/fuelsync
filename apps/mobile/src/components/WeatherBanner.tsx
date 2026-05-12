import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { WeatherConditions, EnvironmentAlert } from '../../../../shared/types';

interface Props {
  weather: WeatherConditions;
  alert: EnvironmentAlert;
}

const LEVEL_COLOR: Record<EnvironmentAlert['level'], string> = {
  none: '#10b981',
  caution: '#f59e0b',
  danger: '#ef4444',
};

export default function WeatherBanner({ weather, alert }: Props) {
  const color = LEVEL_COLOR[alert.level];

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.temp}>{Math.round(weather.tempC)}°C</Text>
          <Text style={styles.desc}>{weather.description}</Text>
          <Text style={styles.meta}>
            {weather.city} · {weather.humidity}% humidity · UV {weather.uvIndex}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: color + '25', borderColor: color }]}>
          <Text style={[styles.badgeText, { color }]}>{alert.level.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.message}>{alert.message}</Text>

      {alert.suggestedPivot && (
        <View style={styles.pivotBox}>
          <Text style={styles.pivotLabel}>Suggested swap → {alert.suggestedPivot.toUpperCase()}</Text>
          {alert.pivotReason && <Text style={styles.pivotReason}>{alert.pivotReason}</Text>}
        </View>
      )}

      {alert.extraHydrationMl && (
        <Text style={styles.hydration}>+{alert.extraHydrationMl} ml extra hydration</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#12122a',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  temp: { color: '#f0f0ff', fontSize: 28, fontWeight: '700' },
  desc: { color: '#f0f0ff', fontSize: 14, textTransform: 'capitalize', marginTop: 2 },
  meta: { color: '#7a7a9a', fontSize: 12, marginTop: 4 },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  message: { color: '#c0c0d8', fontSize: 13, lineHeight: 19 },
  pivotBox: {
    marginTop: 10,
    backgroundColor: '#1a1a35',
    borderRadius: 8,
    padding: 10,
  },
  pivotLabel: { color: '#00d4aa', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  pivotReason: { color: '#9090b0', fontSize: 12, lineHeight: 17 },
  hydration: { color: '#3b82f6', fontSize: 12, marginTop: 8, fontWeight: '600' },
});
