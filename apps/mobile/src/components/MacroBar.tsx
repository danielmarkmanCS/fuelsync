import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
}

export default function MacroBar({ label, current, target, unit, color }: Props) {
  const pct = target > 0 ? Math.min(current / target, 1) : 0;
  const over = target > 0 && current > target;
  const fillColor = over ? '#ef4444' : color;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.values, over && styles.valuesOver]}>
          {Math.round(current)}{unit} / {Math.round(target)}{unit}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round(pct * 100)}%` as `${number}%`, backgroundColor: fillColor },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { color: '#f0f0ff', fontSize: 13, fontWeight: '600' },
  values: { color: '#7a7a9a', fontSize: 12 },
  valuesOver: { color: '#ef4444' },
  track: { height: 6, backgroundColor: '#2a2a4a', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
