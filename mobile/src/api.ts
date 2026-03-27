import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './config';

let _accessToken: string | null = null;
let _refreshPromise: Promise<string> | null = null;

export function setTokens(access: string, refresh?: string): void {
  _accessToken = access;
  if (refresh !== undefined) {
    AsyncStorage.setItem('refreshToken', refresh).catch(() => {});
  }
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export async function loadStoredRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem('refreshToken');
}

export async function clearTokens(): Promise<void> {
  _accessToken = null;
  await AsyncStorage.removeItem('refreshToken');
}

async function refreshAccessToken(): Promise<string> {
  const rt = await AsyncStorage.getItem('refreshToken');
  if (!rt) throw new Error('no refresh token');
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) throw new Error('refresh failed');
  const data = await res.json() as { accessToken: string };
  _accessToken = data.accessToken;
  return data.accessToken;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = async (token: string | null): Promise<T> => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> || {}),
      },
    });
    if (res.status === 401) throw Object.assign(new Error('401'), { status: 401 });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  };

  try {
    return await doFetch(_accessToken);
  } catch (err) {
    if ((err as { status?: number }).status !== 401) throw err;
    if (!_refreshPromise) {
      _refreshPromise = refreshAccessToken().finally(() => { _refreshPromise = null; });
    }
    await _refreshPromise;
    return doFetch(_accessToken);
  }
}

export const apiGet = <T>(path: string) => apiFetch<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) });
