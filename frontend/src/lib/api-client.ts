const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

/** Minimal JSON GET used by the Stage 0 skeleton. The full client arrives in step S4.4. */
export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'same-origin', ...init });
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return (await res.json()) as T;
}
