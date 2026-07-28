import { apiJson } from '../../api';
import type { AuthResponse } from '@miclub/shared';

export type { AuthResponse } from '@miclub/shared';

export const login = (username: string, password: string) => apiJson<AuthResponse>('/auth/login', {
  method: 'POST', body: JSON.stringify({ username, password })
}, { revalidate401: false });

export const register = (clubName: string, email: string, password: string) => apiJson<AuthResponse>('/auth/register', {
  method: 'POST', body: JSON.stringify({ clubName, email, password })
}, { revalidate401: false });
