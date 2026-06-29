const configuredApiBaseUrl = import.meta.env.VITE_API_URL?.trim();
export const API_BASE_URL = configuredApiBaseUrl || '';
export const apiUrl = (path) => `${API_BASE_URL}${path}`;
