import { create } from 'zustand';

export type AppTab = 'home' | 'food' | 'history' | 'supplements' | 'profile' | 'settings';

interface AppStore {
  activeTab: AppTab;
  pendingMealType: string | null;
  setActiveTab: (tab: AppTab) => void;
  setPendingMealType: (meal: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeTab: 'home',
  pendingMealType: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setPendingMealType: (meal) => set({ pendingMealType: meal }),
}));
