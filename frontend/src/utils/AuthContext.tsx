import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
  apiPost,
  setTokens,
  clearTokens,
  loadStoredRefreshToken,
  API_BASE,
} from "./api";

export interface User {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<User>;
  registerEmail: (email: string, password: string) => Promise<User>;
  loginGoogle: (idToken: string) => Promise<User>;
  signOut: () => void;
  updateProfile: (displayName: string) => Promise<User>;
  setUser: (user: User | null) => void;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rt = loadStoredRefreshToken();
    if (!rt) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(async (data: { accessToken: string }) => {
        setTokens(data.accessToken);
        const me: User = await fetch(`${API_BASE}/api/me`, {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        }).then((r) => r.json());
        setUser(me);
      })
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  const _onAuthSuccess = useCallback((data: AuthResponse) => {
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const loginEmail = useCallback(async (email: string, password: string): Promise<User> => {
    const data = await apiPost<AuthResponse>("/api/auth/login", { email, password });
    _onAuthSuccess(data);
    return data.user;
  }, [_onAuthSuccess]);

  const registerEmail = useCallback(async (email: string, password: string): Promise<User> => {
    const data = await apiPost<AuthResponse>("/api/auth/register", { email, password });
    _onAuthSuccess(data);
    return data.user;
  }, [_onAuthSuccess]);

  const loginGoogle = useCallback(async (idToken: string): Promise<User> => {
    const data = await apiPost<AuthResponse>("/api/auth/google", { idToken });
    _onAuthSuccess(data);
    return data.user;
  }, [_onAuthSuccess]);

  const signOut = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (displayName: string): Promise<User> => {
    const updated = await apiPost<User>("/api/me", { displayName });
    setUser((u) => u ? { ...u, ...updated } : u);
    return updated;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginEmail, registerEmail, loginGoogle, signOut, updateProfile, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
