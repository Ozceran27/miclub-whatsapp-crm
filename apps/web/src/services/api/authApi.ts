import { apiJson } from '../../api';
import type { AuthResponse, ClubRegistrationDto, ClubRegistrationResponse } from '@miclub/shared';

export type { AuthResponse } from '@miclub/shared';

export const login = (username: string, password: string) => apiJson<AuthResponse>('/auth/login', {
  method: 'POST', body: JSON.stringify({ username, password })
}, { revalidate401: false });

export const register = (input: ClubRegistrationDto) => apiJson<ClubRegistrationResponse>('/auth/register', {
  method: 'POST', body: JSON.stringify(input)
}, { revalidate401: false });
