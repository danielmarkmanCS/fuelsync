import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, SafeAreaView } from 'react-native';
import { useNutritionStore } from './src/store/nutritionStore';
import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import HomeScreen from './src/screens/HomeScreen';
import FoodScreen from './src/screens/FoodScreen';

type Tab = 'home' | 'food' | 'profile';

const TABS: Array<{ id: Tab; label: string; symbol: string }> = [
  { id: 'home', label: 'Home', symbol: '⌂' },
  { id: 'food', label: 'Food', symbol: '◈' },
  { id: 'profile', label: 'Profile', symbol: '◉' },
];

export default function App() {
  const profile = useNutritionStore((s) => s.profile);
  const [activeTab, setActiveTab] = useState<Tab>('home');

  if (!profile) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />
        <ProfileSetupScreen />
      </>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />
      <View style={styles.content}>
        {activeTab === 'home' && <HomeScreen />}
        {activeTab === 'food' && <FoodScreen />}
        {activeTab === 'profile' && <ProfileSetupScreen editing />}
      </View>
      <SafeAreaView style={styles.tabBarSafe}>
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity key={tab.id} style={styles.tabItem} onPress={() => setActiveTab(tab.id)}>
                <Text style={[styles.tabSymbol, active && styles.tabSymbolActive]}>{tab.symbol}</Text>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d1a' },
  content: { flex: 1 },
  tabBarSafe: { backgroundColor: '#12122a' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#12122a',
    borderTopWidth: 1,
    borderTopColor: '#2a2a4a',
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabSymbol: { fontSize: 20, color: '#4a4a6a' },
  tabSymbolActive: { color: '#00d4aa' },
  tabLabel: { fontSize: 11, color: '#4a4a6a' },
  tabLabelActive: { color: '#00d4aa', fontWeight: '600' },
});
