import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { TrainingType } from '../../../../shared/types';

interface Props {
  selected: TrainingType | null;
  onSelect: (type: TrainingType) => void;
}

const TYPES: Array<{ value: TrainingType; label: string; desc: string; color: string }> = [
  { value: 'rest', label: 'Rest', desc: 'High fat · Low carb', color: '#6b7280' },
  { value: 'strength', label: 'Strength', desc: 'High protein · Mod carb', color: '#f97316' },
  { value: 'cardio', label: 'Cardio', desc: 'High carb · Low fat', color: '#06b6d4' },
  { value: 'hybrid', label: 'Hybrid', desc: 'Balanced macros', color: '#8b5cf6' },
];

export default function TrainingPicker({ selected, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {TYPES.map((type) => {
        const active = selected === type.value;
        return (
          <TouchableOpacity
            key={type.value}
            style={[
              styles.card,
              active && { borderColor: type.color, backgroundColor: type.color + '18' },
            ]}
            onPress={() => onSelect(type.value)}
            activeOpacity={0.75}
          >
            <View style={[styles.dot, { backgroundColor: type.color }]} />
            <Text style={[styles.label, active && { color: type.color }]}>{type.label}</Text>
            <Text style={styles.desc}>{type.desc}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '47%',
    backgroundColor: '#12122a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#2a2a4a',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginBottom: 10 },
  label: { color: '#f0f0ff', fontSize: 16, fontWeight: '700', marginBottom: 5 },
  desc: { color: '#6a6a8a', fontSize: 11, lineHeight: 16 },
});
