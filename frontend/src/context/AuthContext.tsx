// Auth context: holds user/token, exposes login/signup/logout, hydrates from
// localStorage on load and validates the token via GET /auth/me. Wires the API
// service's token + 401 handler so every request is authenticated and a 401
// forces a clean logout.

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { authApi, setAuthToken, setUnauthorizedHandler } from '../services/api.service';
import type { User } from '../types';

const TOKEN_STORAGE_KEY = 'skylark.token';

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  // True while we are hydrating/validating an existing token on first load.
  initializing: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY),
  );
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);

  // Guard against double-hydration in React StrictMode.
  const hydratedRef = useRef(false);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  // Keep the API client's token in sync with state.
  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  // Register the global 401 handler exactly once.
  useEffect(() => {
    setUnauthorizedHandler(() => logout());
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // On first mount: if we have a stored token, validate it via /auth/me.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) {
      setInitializing(false);
      return;
    }

    setAuthToken(stored);
    authApi
      .me()
      .then((u) => {
        setUser(u);
        setToken(stored);
      })
      .catch(() => {
        // Invalid/expired token -> clear it.
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setAuthToken(null);
        setToken(null);
        setUser(null);
      })
      .finally(() => setInitializing(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await authApi.login(username, password);
    setAuthToken(result.token);
    localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const signup = useCallback(async (username: string, password: string) => {
    const result = await authApi.signup(username, password);
    setAuthToken(result.token);
    localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      initializing,
      isAuthenticated: Boolean(token && user),
      login,
      signup,
      logout,
    }),
    [user, token, initializing, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
