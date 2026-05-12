import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNutrition } from '../hooks/useNutrition';
import MacroBar from '../components/MacroBar';
import WeatherBanner from '../components/WeatherBanner';
import TrainingPicker from '../components/TrainingPicker';
import type { TrainingType } from '../../../../shared/types';

export default function HomeScreen() {
  const {
    todayLog,
    targets,
    consumed,
    weather,
    environmentAlert,
    adherenceScore,
    weeklyLoad,
    logDay,
    refreshWeather,
    getMacroBreakdown,
    logWorkoutComplete,
    resetDay,
  } = useNutrition();

  const [workoutTime, setWorkoutTime] = useState(todayLog?.plannedWorkoutTime ?? '');
  const [loadingWeather, setLoadingWeather] = useState(false);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const handleSelectType = (type: TrainingType) => {
    const result = logDay(type, workoutTime || undefined);
    if (result.blocked && result.message) {
      Alert.alert(
        'High Leg Fatigue',
        result.message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Override',
            style: 'destructive',
            onPress: () => logDay(type, workoutTime || undefined),
          },
        ],
      );
    }
  };

  const handleRefreshWeather = async () => {
    setLoadingWeather(true);
    await refreshWeather();
    setLoadingWeather(false);
  };

  const handleResetDay = () => {
    Alert.alert('Reset Day', 'Clear today\'s training type and food log?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetDay },
    ]);
  };

  const breakdown = getMacroBreakdown();

  const scoreColor =
    adherenceScore >= 70 ? '#10b981' : adherenceScore >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>FuelSync</Text>
            <Text style={styles.date}>{today}</Text>
          </View>
          {todayLog && (
            <View style={[styles.scoreBadge, { backgroundColor: scoreColor + '25', borderColor: scoreColor }]}>
              <Text style={[styles.scoreNumber, { color: scoreColor }]}>{adherenceScore}</Text>
              <Text style={[styles.scoreLabel, { color: scoreColor }]}>score</Text>
            </View>
          )}
        </View>

        {/* Training Type */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {todayLog ? "Today's Training" : 'What are you doing today?'}
            </Text>
            {todayLog && (
              <TouchableOpacity onPress={handleResetDay}>
                <Text style={styles.resetBtn}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
          <TrainingPicker selected={todayLog?.trainingType ?? null} onSelect={handleSelectType} />
        </View>

        {/* Workout Time */}
        {todayLog?.trainingType !== 'rest' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Planned workout time{' '}
              <Text style={styles.optional}>(enables carb timing)</Text>
            </Text>
            <TextInput
              style={styles.timeInput}
              value={workoutTime}
              onChangeText={(v) => {
                setWorkoutTime(v);
                if (todayLog) logDay(todayLog.trainingType, v || undefined);
              }}
              placeholder="18:00"
              placeholderTextColor="#4a4a6a"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
        )}

        {/* Macro Targets */}
        {targets ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Macro Targets</Text>
            <View style={styles.card}>
              <MacroBar label="Calories" current={consumed.calories} target={targets.calories} unit=" kcal" color="#10b981" />
              <MacroBar label="Protein"  current={consumed.proteinG}  target={targets.proteinG}  unit="g"    color="#ef4444" />
              <MacroBar label="Carbs"    current={consumed.carbsG}    target={targets.carbsG}    unit="g"    color="#f59e0b" />
              <MacroBar label="Fat"      current={consumed.fatG}      target={targets.fatG}      unit="g"    color="#3b82f6" />
            </View>

            {targets.carbTimingWindow && (
              <View style={styles.timingCard}>
                <Text style={styles.timingTitle}>Carb Timing Window</Text>
                <Text style={styles.timingWindow}>
                  {targets.carbTimingWindow.preWorkoutStart} – {targets.carbTimingWindow.postWorkoutEnd}
                </Text>
                <Text style={styles.timingNote}>
                  Concentrate {targets.carbTimingWindow.windowCarbsG}g carbs in this window
                </Text>
              </View>
            )}
          </View>
        ) : (
          todayLog === null && (
            <View style={styles.section}>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Select a training type above to see your macro targets.</Text>
              </View>
            </View>
          )
        )}

        {/* Rationale */}
        {breakdown && (
          <View style={styles.section}>
            <View style={styles.rationaleCard}>
              <Text style={styles.rationaleTitle}>Why these macros?</Text>
              <Text style={styles.rationaleText}>{breakdown.rationale}</Text>
              <Text style={styles.tdeeLine}>TDEE: {breakdown.tdee} kcal/day</Text>
            </View>
          </View>
        )}

        {/* Weekly Load */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Load</Text>
          <View style={styles.loadGrid}>
            <LoadStat label="Run km" value={weeklyLoad.totalRunKm.toFixed(1)} />
            <LoadStat label="Strength sets" value={String(weeklyLoad.totalStrengthSets)} />
            <LoadStat
              label="Leg fatigue"
              value={`${weeklyLoad.legFatigueScore}/100`}
              warn={weeklyLoad.legFatigueScore >= 70}
            />
            <LoadStat
              label="Recovery"
              value={`${weeklyLoad.recoveryScore}/100`}
              good={weeklyLoad.recoveryScore >= 70}
            />
          </View>
          {todayLog && (
            <TouchableOpacity
              style={styles.workoutDoneBtn}
              onPress={() => {
                Alert.prompt?.(
                  'Log Workout',
                  'km run (leave blank for 0):',
                  (km) => logWorkoutComplete(parseFloat(km) || 0),
                ) ?? logWorkoutComplete(0);
              }}
            >
              <Text style={styles.workoutDoneBtnText}>Log Workout Complete</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Environment */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Environment</Text>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={handleRefreshWeather}
              disabled={loadingWeather}
            >
              <Text style={styles.refreshBtnText}>{loadingWeather ? 'Loading…' : 'Refresh'}</Text>
            </TouchableOpacity>
          </View>
          {weather && environmentAlert ? (
            <WeatherBanner weather={weather} alert={environmentAlert} />
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                Tap Refresh to load local conditions and get training recommendations.
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function LoadStat({
  label,
  value,
  warn,
  good,
}: {
  label: string;
  value: string;
  warn?: boolean;
  good?: boolean;
}) {
  const valueColor = warn ? '#ef4444' : good ? '#10b981' : '#f0f0ff';
  return (
    <View style={loadStyles.stat}>
      <Text style={[loadStyles.value, { color: valueColor }]}>{value}</Text>
      <Text style={loadStyles.label}>{label}</Text>
    </View>
  );
}

const loadStyles = StyleSheet.create({
  stat: {
    flex: 1,
    backgroundColor: '#12122a',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  value: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  label: { color: '#6a6a8a', fontSize: 11, textAlign: 'center' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d1a' },
  scroll: { padding: 16, paddingTop: 12 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  appName: { color: '#00d4aa', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  date: { color: '#7a7a9a', fontSize: 13, marginTop: 4 },
  scoreBadge: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: 'center',
  },
  scoreNumber: { fontSize: 22, fontWeight: '800' },
  scoreLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginTop: 1 },

  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#f0f0ff', fontSize: 14, fontWeight: '700', letterSpacing: 0.3, marginBottom: 12 },
  optional: { color: '#4a4a6a', fontWeight: '400', fontSize: 12 },
  resetBtn: { color: '#ef4444', fontSize: 13 },

  timeInput: {
    backgroundColor: '#12122a',
    borderWidth: 1,
    borderColor: '#2a2a4a',
    borderRadius: 10,
    color: '#f0f0ff',
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
    letterSpacing: 2,
  },

  card: {
    backgroundColor: '#12122a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },

  timingCard: {
    marginTop: 10,
    backgroundColor: '#0f1f2a',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1a4a6a',
  },
  timingTitle: { color: '#3b82f6', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  timingWindow: { color: '#f0f0ff', fontSize: 22, fontWeight: '800' },
  timingNote: { color: '#6090b0', fontSize: 12, marginTop: 4 },

  rationaleCard: {
    backgroundColor: '#12122a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  rationaleTitle: { color: '#00d4aa', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  rationaleText: { color: '#b0b0c8', fontSize: 13, lineHeight: 20 },
  tdeeLine: { color: '#5a5a7a', fontSize: 12, marginTop: 8 },

  loadGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },

  workoutDoneBtn: {
    borderWidth: 1.5,
    borderColor: '#00d4aa',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  workoutDoneBtnText: { color: '#00d4aa', fontSize: 14, fontWeight: '700' },

  refreshBtn: {
    backgroundColor: '#1a1a35',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    marginBottom: 12,
  },
  refreshBtnText: { color: '#00d4aa', fontSize: 13, fontWeight: '600' },

  emptyCard: {
    backgroundColor: '#12122a',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    alignItems: 'center',
  },
  emptyText: { color: '#5a5a7a', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
