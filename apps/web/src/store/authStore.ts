import { create } from 'zustand';
import type { BackendUser } from '../api/auth';
import { token } from '../api/client';

interface AuthState {
  user: BackendUser | null;
  hasToken: boolean;
  setAuth: (t: string, u: BackendUser) => void;
  setUser: (u: BackendUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  hasToken: !!token.get(),

  setAuth: (t, u) => {
    token.set(t);
    set({ user: u, hasToken: true });
  },

  setUser: (u) => set({ user: u }),

  logout: () => {
    token.clear();
    set({ user: null, hasToken: false });
  },
}));
