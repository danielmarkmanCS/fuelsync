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

const SESSION_KEY = 'fuelsync_pin_verified';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  pinVerified: sessionStorage.getItem(SESSION_KEY) === '1',

  setUser: (u) => set({ user: u }),

  setPinVerified: (v) => {
    if (v) sessionStorage.setItem(SESSION_KEY, '1');
    else sessionStorage.removeItem(SESSION_KEY);
    set({ pinVerified: v });
  },

  logout: () => {
    sessionStorage.removeItem(SESSION_KEY);
    useNutritionStore.getState().resetAll();
    set({ user: null, pinVerified: false });
  },
}));
