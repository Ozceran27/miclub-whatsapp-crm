const configuredApiBaseUrl = import.meta.env.VITE_API_URL?.trim();

export const API_BASE_URL = configuredApiBaseUrl || '';

export const apiUrl = (path: `/${string}`) => `${API_BASE_URL}${path}`;

export type ApiErrorCode = 'AUTHENTICATION_REQUIRED' | 'SESSION_EXPIRED' | 'FORBIDDEN' | 'FEATURE_DISABLED' | 'TENANT_CONTEXT_REQUIRED' | 'CSRF_INVALID' | 'IMPORT_DISABLED';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: ApiErrorCode | string | undefined, message: string) {
    super(message);
  }
}

let sessionValidation: Promise<boolean> | null = null;

const confirmSessionExpired = async (): Promise<boolean> => {
  if (!sessionValidation) {
    sessionValidation = fetch(apiUrl('/auth/me'), { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { authenticated?: boolean } | null;
        return response.status === 401 && body?.authenticated === false;
      })
      .catch(() => false)
      .finally(() => { sessionValidation = null; });
  }
  return sessionValidation;
};

/** Cliente HTTP único: siempre incluye la cookie y sólo expira auth tras revalidar /auth/me. */
export const apiFetch = async (path: `/${string}`, init: RequestInit = {}, options: { revalidate401?: boolean } = {}) => {
  const response = await fetch(apiUrl(path), { ...init, credentials: 'include' });
  if (response.status === 401 && options.revalidate401 !== false && !path.startsWith('/auth/')) {
    if (await confirmSessionExpired()) window.dispatchEvent(new Event('miclub:session-expired'));
  }
  return response;
};

export const readApiError = async (response: Response): Promise<ApiError> => {
  const payload = await response.json().catch(() => undefined) as { code?: string; message?: string } | undefined;
  return new ApiError(response.status, payload?.code, payload?.message ?? `HTTP ${response.status}`);
};
