// Thin fetch wrapper that attaches JWT and handles token refresh.

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _refreshPromise: Promise<string> | null = null;

export class ApiError extends Error {
  status: number;
  response: Response;
  constructor(status: number, response: Response) {
    super(`API ${status}`);
    this.status = status;
    this.response = response;
  }
}

export function setTokens(access: string, refresh?: string): void {
  _accessToken = access;
  if (refresh !== undefined) {
    _refreshToken = refresh;
    localStorage.setItem("refreshToken", refresh);
  }
}

export function getAccessToken(): string | null { return _accessToken; }

export function loadStoredRefreshToken(): string | null {
  return localStorage.getItem("refreshToken");
}

export function clearTokens(): void {
  _accessToken = null;
  _refreshToken = null;
  localStorage.removeItem("refreshToken");
}

async function refreshAccessToken(): Promise<string> {
  const rt = _refreshToken || loadStoredRefreshToken();
  if (!rt) throw new Error("no refresh token");
  const res = await fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) throw new Error("refresh failed");
  const data = await res.json();
  _accessToken = data.accessToken;
  return data.accessToken as string;
}

async function withRefresh<T>(fn: (token: string | null) => Promise<T>): Promise<T> {
  try {
    return await fn(_accessToken);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    if (!_refreshPromise) {
      _refreshPromise = refreshAccessToken().finally(() => { _refreshPromise = null; });
    }
    await _refreshPromise;
    return fn(_accessToken);
  }
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = async (token: string | null): Promise<T> => {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> || {}),
      },
    });
    if (!res.ok) throw new ApiError(res.status, res);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  };

  return withRefresh(doFetch);
}

export function apiGet<T = unknown>(path: string): Promise<T> { return apiFetch<T>(path); }

export function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPut<T = unknown>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function apiDelete<T = unknown>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}

export const API_BASE = BASE;
