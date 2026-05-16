import { create } from 'zustand';
import type { BackendUser } from '../api/auth';
import { useNutritionStore } from './nutritionStore';

interface AuthState {
  user: BackendUser | null;
  pinVerified: boolean;
  setUser: (u: BackendUser) => void;
  setPinVerified: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  pinVerified: false,

  setUser: (u) => set({ user: u }),

  setPinVerified: (v) => set({ pinVerified: v }),

  logout: () => {
    useNutritionStore.getState().resetAll();
    set({ pinVerified: false });
  },
}));
