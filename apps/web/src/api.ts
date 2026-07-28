const configuredApiBaseUrl = import.meta.env?.VITE_API_URL?.trim();

export const API_BASE_URL = configuredApiBaseUrl || '';
export const apiUrl = (path: `/${string}`) => `${API_BASE_URL}${path}`;

export type ApiErrorCode = 'AUTHENTICATION_REQUIRED' | 'SESSION_EXPIRED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'SERVICE_UNAVAILABLE' | 'NETWORK_ERROR' | 'REQUEST_TIMEOUT' | 'REQUEST_CANCELLED' | string;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiFetchOptions = { revalidate401?: boolean; timeoutMs?: number };
const DEFAULT_TIMEOUT_MS = 15_000;
let sessionValidation: Promise<boolean> | null = null;

const parseErrorPayload = async (response: Response) => {
  const payload = await response.clone().json().catch(() => undefined) as { code?: string; error?: string; message?: string; requestId?: string; details?: unknown; errors?: unknown } | undefined;
  const statusCode: Record<number, ApiErrorCode> = { 401: 'AUTHENTICATION_REQUIRED', 403: 'FORBIDDEN', 422: 'VALIDATION_ERROR', 503: 'SERVICE_UNAVAILABLE' };
  return new ApiError(
    response.status,
    payload?.code ?? statusCode[response.status] ?? 'HTTP_ERROR',
    payload?.message ?? payload?.error ?? `HTTP ${response.status}`,
    payload?.requestId ?? response.headers.get('x-request-id') ?? undefined,
    payload?.details ?? payload?.errors
  );
};

const confirmSessionExpired = async (): Promise<boolean> => {
  if (!sessionValidation) {
    sessionValidation = apiFetch('/auth/me', { cache: 'no-store' }, { revalidate401: false })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { authenticated?: boolean } | null;
        return response.status === 401 && body?.authenticated === false;
      })
      .catch(() => false)
      .finally(() => { sessionValidation = null; });
  }
  return sessionValidation;
};

/** Transporte HTTP único: cookies, timeout, cancelación y revalidación de sesión. */
export const apiFetch = async (path: `/${string}`, init: RequestInit = {}, options: ApiFetchOptions = {}): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const abort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) abort();
  try {
    const response = await fetch(apiUrl(path), { ...init, credentials: 'include', signal: controller.signal });
    if (response.status === 401 && options.revalidate401 !== false && !path.startsWith('/auth/')) {
      if (await confirmSessionExpired() && typeof window !== 'undefined') window.dispatchEvent(new Event('miclub:session-expired'));
    }
    return response;
  } catch (error) {
    if (controller.signal.aborted) {
      const cancelled = init.signal?.aborted;
      throw new ApiError(0, cancelled ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT', cancelled ? 'La solicitud fue cancelada.' : 'La solicitud agotó el tiempo de espera.');
    }
    throw new ApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : 'No se pudo conectar con el servidor.');
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
};

export const readApiError = parseErrorPayload;

export const apiJson = async <T>(path: `/${string}`, init: RequestInit = {}, options?: ApiFetchOptions): Promise<T> => {
  const headers = init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers;
  const response = await apiFetch(path, { ...init, headers }, options);
  if (!response.ok) throw await readApiError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};
