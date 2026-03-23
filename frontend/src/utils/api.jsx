// Thin fetch wrapper that attaches JWT and handles token refresh.

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

let _accessToken = null;
let _refreshToken = null;
let _refreshPromise = null;

export function setTokens(access, refresh) {
  _accessToken = access;
  if (refresh !== undefined) _refreshToken = refresh;
  if (refresh !== undefined) {
    localStorage.setItem("refreshToken", refresh);
  }
}

export function getAccessToken() { return _accessToken; }

export function loadStoredRefreshToken() {
  return localStorage.getItem("refreshToken");
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
  localStorage.removeItem("refreshToken");
}

async function refreshAccessToken() {
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
  return data.accessToken;
}

async function withRefresh(fn) {
  try {
    return await fn(_accessToken);
  } catch (err) {
    if (err?.status !== 401) throw err;
    // Single refresh attempt
    if (!_refreshPromise) {
      _refreshPromise = refreshAccessToken().finally(() => { _refreshPromise = null; });
    }
    await _refreshPromise;
    return fn(_accessToken);
  }
}

export async function apiFetch(path, options = {}) {
  const doFetch = async (token) => {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = new Error(`API ${res.status}`);
      err.status = res.status;
      err.response = res;
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  return withRefresh(doFetch);
}

export function apiGet(path) { return apiFetch(path); }

export function apiPost(path, body) {
  return apiFetch(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPut(path, body) {
  return apiFetch(path, { method: "PUT", body: JSON.stringify(body) });
}

export function apiDelete(path) {
  return apiFetch(path, { method: "DELETE" });
}

export const API_BASE = BASE;
