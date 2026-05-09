const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/+$/, '');

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(path: string, method: HttpMethod = 'GET', body?: unknown, token?: string): Promise<T> {
  const authToken = token || sessionStorage.getItem('active_api_token') || '';
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message || 'API request failed';
    throw new Error(msg);
  }
  return json as T;
}

export const api = {
  baseUrl: API_BASE_URL,
  get: <T>(path: string, token?: string) => request<T>(path, 'GET', undefined, token),
  post: <T>(path: string, body?: unknown, token?: string) => request<T>(path, 'POST', body, token),
  patch: <T>(path: string, body?: unknown, token?: string) => request<T>(path, 'PATCH', body, token),
  del: <T>(path: string, body?: unknown, token?: string) => request<T>(path, 'DELETE', body, token),
};

