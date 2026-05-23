import { create } from 'zustand';

interface AppStore {
  activeTab: 'home' | 'food' | 'history' | 'supplements' | 'profile';
  pendingMealType: string | null;
  setActiveTab: (tab: AppStore['activeTab']) => void;
  setPendingMealType: (meal: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeTab: 'home',
  pendingMealType: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setPendingMealType: (meal) => set({ pendingMealType: meal }),
}));
