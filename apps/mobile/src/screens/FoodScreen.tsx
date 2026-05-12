import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNutrition } from '../hooks/useNutrition';
import MacroBar from '../components/MacroBar';
import type { FoodEntry } from '../../../../shared/types';

type MealSlot = FoodEntry['mealSlot'];

const MEAL_SLOTS: Array<{ value: MealSlot; label: string }> = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'pre_workout', label: 'Pre-Workout' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'post_workout', label: 'Post-Workout' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

interface FormState {
  name: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  grams: string;
  mealSlot: MealSlot;
}

const EMPTY_FORM: FormState = {
  name: '',
  calories: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  grams: '',
  mealSlot: 'lunch',
};

export default function FoodScreen() {
  const { targets, consumed, remaining, foodEntries, addFood, removeFood } = useNutrition();

  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const patchForm = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const handleAdd = () => {
    const cal = parseFloat(form.calories);
    const pro = parseFloat(form.proteinG);
    const carb = parseFloat(form.carbsG);
    const fat = parseFloat(form.fatG);
    const gr = parseFloat(form.grams);

    if (!form.name.trim()) { Alert.alert('Missing field', 'Enter a food name.'); return; }
    if (isNaN(cal) || isNaN(pro) || isNaN(carb) || isNaN(fat) || isNaN(gr)) {
      Alert.alert('Missing fields', 'Fill in all numeric fields.');
      return;
    }

    addFood({
      name: form.name.trim(),
      calories: cal,
      proteinG: pro,
      carbsG: carb,
      fatG: fat,
      grams: gr,
      mealSlot: form.mealSlot,
    });

    setForm(EMPTY_FORM);
    setModalVisible(false);
  };

  const handleRemove = (entry: FoodEntry) => {
    Alert.alert('Remove entry', `Remove "${entry.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFood(entry.id) },
    ]);
  };

  const slotGroups = MEAL_SLOTS.map((slot) => ({
    ...slot,
    entries: foodEntries.filter((e) => e.mealSlot === slot.value),
  })).filter((g) => g.entries.length > 0);

  return (
    <SafeAreaView style={styles.root}>
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Food Log</Text>

          {/* Macro summary */}
          {targets ? (
            <View style={styles.card}>
              <MacroBar label="Calories" current={consumed.calories} target={targets.calories} unit=" kcal" color="#10b981" />
              <MacroBar label="Protein"  current={consumed.proteinG}  target={targets.proteinG}  unit="g"    color="#ef4444" />
              <MacroBar label="Carbs"    current={consumed.carbsG}    target={targets.carbsG}    unit="g"    color="#f59e0b" />
              <MacroBar label="Fat"      current={consumed.fatG}      target={targets.fatG}      unit="g"    color="#3b82f6" />
            </View>
          ) : (
            <View style={styles.noTargetCard}>
              <Text style={styles.noTargetText}>
                Log your training type on the Home tab to see macro targets.
              </Text>
            </View>
          )}

          {/* Remaining */}
          {remaining && (
            <View style={styles.remainingRow}>
              <RemainingChip label="Cal" value={Math.round(remaining.calories)} unit="kcal" />
              <RemainingChip label="Pro" value={Math.round(remaining.proteinG)} unit="g" />
              <RemainingChip label="Carbs" value={Math.round(remaining.carbsG)} unit="g" />
              <RemainingChip label="Fat" value={Math.round(remaining.fatG)} unit="g" />
            </View>
          )}

          {/* Food entries */}
          {slotGroups.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No food logged yet</Text>
              <Text style={styles.emptySubtitle}>Tap + to add your first entry</Text>
            </View>
          ) : (
            slotGroups.map((slot) => (
              <View key={slot.value} style={styles.slotSection}>
                <Text style={styles.slotTitle}>{slot.label}</Text>
                {slot.entries.map((entry) => (
                  <TouchableOpacity
                    key={entry.id}
                    style={styles.entryRow}
                    onLongPress={() => handleRemove(entry)}
                    delayLongPress={400}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entryName}>{entry.name}</Text>
                      <Text style={styles.entryMacros}>
                        P {entry.proteinG}g · C {entry.carbsG}g · F {entry.fatG}g
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.entryCals}>{Math.round(entry.calories)} kcal</Text>
                      <Text style={styles.entryGrams}>{entry.grams}g</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* FAB */}
        <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Add Food Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Food</Text>

            <TextInput
              style={styles.modalInput}
              value={form.name}
              onChangeText={(v) => patchForm({ name: v })}
              placeholder="Food name"
              placeholderTextColor="#4a4a6a"
              autoFocus
              returnKeyType="next"
            />

            <View style={styles.modalRow}>
              <TextInput
                style={[styles.modalInput, styles.modalHalf]}
                value={form.calories}
                onChangeText={(v) => patchForm({ calories: v })}
                placeholder="Calories"
                placeholderTextColor="#4a4a6a"
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.modalInput, styles.modalHalf]}
                value={form.grams}
                onChangeText={(v) => patchForm({ grams: v })}
                placeholder="Grams"
                placeholderTextColor="#4a4a6a"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.modalRow}>
              <TextInput
                style={[styles.modalInput, styles.modalThird]}
                value={form.proteinG}
                onChangeText={(v) => patchForm({ proteinG: v })}
                placeholder="Protein g"
                placeholderTextColor="#4a4a6a"
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.modalInput, styles.modalThird]}
                value={form.carbsG}
                onChangeText={(v) => patchForm({ carbsG: v })}
                placeholder="Carbs g"
                placeholderTextColor="#4a4a6a"
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.modalInput, styles.modalThird]}
                value={form.fatG}
                onChangeText={(v) => patchForm({ fatG: v })}
                placeholder="Fat g"
                placeholderTextColor="#4a4a6a"
                keyboardType="decimal-pad"
              />
            </View>

            {/* Meal slot chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.slotScroll}
            >
              {MEAL_SLOTS.map((slot) => (
                <TouchableOpacity
                  key={slot.value}
                  style={[styles.slotChip, form.mealSlot === slot.value && styles.slotChipActive]}
                  onPress={() => patchForm({ mealSlot: slot.value })}
                >
                  <Text
                    style={[
                      styles.slotChipText,
                      form.mealSlot === slot.value && styles.slotChipTextActive,
                    ]}
                  >
                    {slot.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setForm(EMPTY_FORM); setModalVisible(false); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
                <Text style={styles.addBtnText}>Add Entry</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function RemainingChip({ label, value, unit }: { label: string; value: number; unit: string }) {
  const depleted = value <= 0;
  return (
    <View style={[chipStyles.chip, depleted && chipStyles.chipDepleted]}>
      <Text style={[chipStyles.value, depleted && chipStyles.valueDepleted]}>{value}</Text>
      <Text style={chipStyles.unit}>{unit}</Text>
      <Text style={chipStyles.label}>{label} left</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    backgroundColor: '#12122a',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  chipDepleted: { borderColor: '#10b981', backgroundColor: '#10b98112' },
  value: { color: '#f0f0ff', fontSize: 16, fontWeight: '800' },
  valueDepleted: { color: '#10b981' },
  unit: { color: '#6a6a8a', fontSize: 10, marginTop: 1 },
  label: { color: '#5a5a7a', fontSize: 9, marginTop: 2 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d1a' },
  scroll: { padding: 16, paddingTop: 12 },
  title: { color: '#f0f0ff', fontSize: 24, fontWeight: '800', marginBottom: 16 },

  card: {
    backgroundColor: '#12122a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    marginBottom: 12,
  },
  noTargetCard: {
    backgroundColor: '#12122a',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    marginBottom: 12,
  },
  noTargetText: { color: '#5a5a7a', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  remainingRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },

  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { color: '#4a4a6a', fontSize: 16, fontWeight: '700' },
  emptySubtitle: { color: '#3a3a5a', fontSize: 13, marginTop: 6 },

  slotSection: { marginBottom: 20 },
  slotTitle: {
    color: '#9090b0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  entryRow: {
    flexDirection: 'row',
    backgroundColor: '#12122a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  entryName: { color: '#f0f0ff', fontSize: 14, fontWeight: '600' },
  entryMacros: { color: '#6a6a8a', fontSize: 12, marginTop: 3 },
  entryCals: { color: '#f0f0ff', fontSize: 14, fontWeight: '700' },
  entryGrams: { color: '#5a5a7a', fontSize: 11, marginTop: 2 },

  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00d4aa',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#00d4aa',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabText: { color: '#0d0d1a', fontSize: 28, fontWeight: '700', lineHeight: 32 },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#00000080',
  },
  modalCard: {
    backgroundColor: '#12122a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: '#2a2a4a',
  },
  modalTitle: { color: '#f0f0ff', fontSize: 18, fontWeight: '800', marginBottom: 16 },
  modalInput: {
    backgroundColor: '#0d0d1a',
    borderWidth: 1,
    borderColor: '#2a2a4a',
    borderRadius: 10,
    color: '#f0f0ff',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  modalRow: { flexDirection: 'row', gap: 8 },
  modalHalf: { flex: 1 },
  modalThird: { flex: 1 },

  slotScroll: { gap: 8, paddingVertical: 4, marginBottom: 16 },
  slotChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a35',
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  slotChipActive: { backgroundColor: '#00d4aa20', borderColor: '#00d4aa' },
  slotChipText: { color: '#6a6a8a', fontSize: 13, fontWeight: '600' },
  slotChipTextActive: { color: '#00d4aa' },

  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2a2a4a',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#7a7a9a', fontSize: 15, fontWeight: '700' },
  addBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#00d4aa',
    alignItems: 'center',
  },
  addBtnText: { color: '#0d0d1a', fontSize: 15, fontWeight: '800' },
});
