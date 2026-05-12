import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useNutritionStore } from '../store/nutritionStore';
import type { UserProfile } from '../../../../shared/types';

interface Props {
  editing?: boolean;
}

const ACTIVITY_LEVELS: Array<{ value: UserProfile['activityLevel']; label: string; desc: string }> = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Desk job, little or no exercise' },
  { value: 'light', label: 'Light', desc: '1–3 training days / week' },
  { value: 'moderate', label: 'Moderate', desc: '3–5 training days / week' },
  { value: 'very_active', label: 'Very Active', desc: '6–7 training days / week' },
  { value: 'extra_active', label: 'Extra Active', desc: 'Twice-daily training' },
];

export default function ProfileSetupScreen({ editing = false }: Props) {
  const { profile, setProfile } = useNutritionStore();

  const [weightKg, setWeightKg] = useState(profile?.weightKg?.toString() ?? '');
  const [heightCm, setHeightCm] = useState(profile?.heightCm?.toString() ?? '');
  const [age, setAge] = useState(profile?.age?.toString() ?? '');
  const [sex, setSex] = useState<'male' | 'female'>(profile?.sex ?? 'male');
  const [activityLevel, setActivityLevel] = useState<UserProfile['activityLevel']>(
    profile?.activityLevel ?? 'moderate',
  );
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const w = parseFloat(weightKg);
    const h = parseFloat(heightCm);
    const a = parseInt(age, 10);

    if (isNaN(w) || w < 30 || w > 300) { setError('Enter a valid weight (30–300 kg).'); return; }
    if (isNaN(h) || h < 100 || h > 250) { setError('Enter a valid height (100–250 cm).'); return; }
    if (isNaN(a) || a < 10 || a > 100) { setError('Enter a valid age (10–100).'); return; }

    const updated: UserProfile = {
      id: profile?.id ?? `user-${Date.now()}`,
      weightKg: w,
      heightCm: h,
      age: a,
      sex,
      activityLevel,
      goals: profile?.goals ?? [],
    };

    setProfile(updated);
    setError('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{editing ? 'Profile' : 'Set Up Your Profile'}</Text>
          {!editing && (
            <Text style={styles.subtitle}>
              FuelSync needs your stats to calculate personalised macro targets.
            </Text>
          )}

          {/* Weight + Height */}
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Weight (kg)</Text>
              <TextInput
                style={styles.input}
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="decimal-pad"
                placeholder="75"
                placeholderTextColor="#4a4a6a"
                returnKeyType="next"
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Height (cm)</Text>
              <TextInput
                style={styles.input}
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="decimal-pad"
                placeholder="178"
                placeholderTextColor="#4a4a6a"
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Age */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Age</Text>
            <TextInput
              style={styles.input}
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              placeholder="25"
              placeholderTextColor="#4a4a6a"
              returnKeyType="done"
            />
          </View>

          {/* Sex */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Biological sex</Text>
            <View style={styles.toggle}>
              {(['male', 'female'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.toggleOption, sex === s && styles.toggleOptionActive]}
                  onPress={() => setSex(s)}
                >
                  <Text style={[styles.toggleText, sex === s && styles.toggleTextActive]}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Activity Level */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Activity level</Text>
            {ACTIVITY_LEVELS.map((al) => {
              const active = activityLevel === al.value;
              return (
                <TouchableOpacity
                  key={al.value}
                  style={[styles.activityOption, active && styles.activityOptionActive]}
                  onPress={() => setActivityLevel(al.value)}
                >
                  <Text style={[styles.activityLabel, active && styles.activityLabelActive]}>
                    {al.label}
                  </Text>
                  <Text style={styles.activityDesc}>{al.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.saveBtn, saved && styles.saveBtnSuccess]}
            onPress={handleSave}
          >
            <Text style={styles.saveBtnText}>
              {saved ? 'Saved!' : editing ? 'Save Changes' : 'Get Started'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d1a' },
  scroll: { padding: 20, paddingTop: 40 },
  title: { color: '#f0f0ff', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#7a7a9a', fontSize: 14, lineHeight: 20, marginBottom: 28 },

  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  field: { marginBottom: 24 },
  fieldLabel: { color: '#9090b0', fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#12122a',
    borderWidth: 1,
    borderColor: '#2a2a4a',
    borderRadius: 10,
    color: '#f0f0ff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 24,
  },

  toggle: { flexDirection: 'row', gap: 10 },
  toggleOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2a2a4a',
    backgroundColor: '#12122a',
    alignItems: 'center',
  },
  toggleOptionActive: { borderColor: '#00d4aa', backgroundColor: '#00d4aa18' },
  toggleText: { color: '#6a6a8a', fontSize: 15, fontWeight: '600' },
  toggleTextActive: { color: '#00d4aa' },

  activityOption: {
    backgroundColor: '#12122a',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2a2a4a',
    padding: 12,
    marginBottom: 8,
  },
  activityOptionActive: { borderColor: '#00d4aa', backgroundColor: '#00d4aa12' },
  activityLabel: { color: '#9090b0', fontSize: 14, fontWeight: '700' },
  activityLabelActive: { color: '#00d4aa' },
  activityDesc: { color: '#5a5a7a', fontSize: 12, marginTop: 3 },

  error: { color: '#ef4444', fontSize: 13, marginBottom: 16 },

  saveBtn: {
    backgroundColor: '#00d4aa',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnSuccess: { backgroundColor: '#10b981' },
  saveBtnText: { color: '#0d0d1a', fontSize: 16, fontWeight: '800' },
});
