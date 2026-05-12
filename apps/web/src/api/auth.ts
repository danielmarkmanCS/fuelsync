import { api, token } from './client';

export interface BackendUser {
  id: string;
  email: string;
  dailyGoal: number;
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  gender: 'male' | 'female' | null;
  activityLevel: string;
}

interface AuthResponse { token: string; user: BackendUser; }

export async function register(email: string, password: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/register', { email, password });
  token.set(res.token);
  return res;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/login', { email, password });
  token.set(res.token);
  return res;
}

export function getMe() {
  return api.get<BackendUser>('/auth/me');
}

export function updateProfile(data: Partial<{
  weightKg: number; heightCm: number; age: number;
  gender: string; activityLevel: string;
}>) {
  return api.patch<BackendUser>('/auth/profile', data);
}

export function forgotPassword(email: string) {
  return api.post<{ ok: boolean }>('/auth/forgot-password', { email });
}

export function resetPassword(token: string, password: string) {
  return api.post<{ token: string; user: BackendUser }>('/auth/reset-password', { token, password });
}
