import { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  apiPost,
  setTokens,
  clearTokens,
  loadStoredRefreshToken,
  API_BASE,
} from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // { id, email, displayName, photoURL, ... }
  const [loading, setLoading] = useState(true);

  // On mount, try to restore session from stored refresh token
  useEffect(() => {
    const rt = loadStoredRefreshToken();
    if (!rt) {
      setLoading(false);
      return;
    }
    // Refresh access token, then load user
    fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(async (data) => {
        setTokens(data.accessToken);
        const me = await fetch(`${API_BASE}/api/me`, {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        }).then((r) => r.json());
        setUser(me);
      })
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  const _onAuthSuccess = useCallback((data) => {
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const loginEmail = useCallback(async (email, password) => {
    const data = await apiPost("/api/auth/login", { email, password });
    _onAuthSuccess(data);
    return data.user;
  }, [_onAuthSuccess]);

  const registerEmail = useCallback(async (email, password) => {
    const data = await apiPost("/api/auth/register", { email, password });
    _onAuthSuccess(data);
    return data.user;
  }, [_onAuthSuccess]);

  // Google: receives credential from Google Identity Services
  const loginGoogle = useCallback(async (idToken) => {
    const data = await apiPost("/api/auth/google", { idToken });
    _onAuthSuccess(data);
    return data.user;
  }, [_onAuthSuccess]);

  const signOut = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (displayName) => {
    const updated = await apiPost("/api/me", { displayName });
    setUser((u) => ({ ...u, ...updated }));
    return updated;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginEmail, registerEmail, loginGoogle, signOut, updateProfile, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
