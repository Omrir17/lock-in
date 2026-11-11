// Tiny client for the Worker API. The session token lives in localStorage.
const KEY = 'lockin-token';

export function getToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function setToken(t: string | null) {
  try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  window.dispatchEvent(new Event('lockin-auth'));
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch('api/' + path, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) setToken(null);
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `שגיאה ${res.status}`);
  return data as T;
}
