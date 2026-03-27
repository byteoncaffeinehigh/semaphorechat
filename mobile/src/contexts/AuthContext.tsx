import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiPost, setTokens, clearTokens, loadStoredRefreshToken, getAccessToken } from '../api';
import { API_BASE } from '../config';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<User>;
  registerEmail: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredRefreshToken().then(async (rt) => {
      if (!rt) { setLoading(false); return; }
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) throw new Error('refresh failed');
        const data = await res.json() as { accessToken: string };
        setTokens(data.accessToken);
        const me = await fetch(`${API_BASE}/api/me`, {
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        }).then((r) => r.json()) as User;
        setUser(me);
      } catch {
        await clearTokens();
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const _onSuccess = useCallback((data: AuthResponse) => {
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  }, []);

  const loginEmail = useCallback(async (email: string, password: string): Promise<User> => {
    const data = await apiPost<AuthResponse>('/api/auth/login', { email, password });
    return _onSuccess(data);
  }, [_onSuccess]);

  const registerEmail = useCallback(async (email: string, password: string): Promise<User> => {
    const data = await apiPost<AuthResponse>('/api/auth/register', { email, password });
    return _onSuccess(data);
  }, [_onSuccess]);

  const signOut = useCallback(async () => {
    await clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginEmail, registerEmail, signOut, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
