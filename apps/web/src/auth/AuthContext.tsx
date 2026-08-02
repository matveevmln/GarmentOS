import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthResponseDto, AuthenticatedUserResponseDto, LoginDto } from "@garmentos/shared-types";
import { apiRequest, clearTokens, getAccessToken, setTokens } from "../api/client";

interface AuthContextValue {
  user: AuthenticatedUserResponseDto | null;
  isLoading: boolean;
  login: (input: LoginDto) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_STORAGE_KEY = "garmentos.user";

function loadStoredUser(): AuthenticatedUserResponseDto | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthenticatedUserResponseDto;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUserResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Сессия переживает закрытие браузера — access/refresh уже в localStorage
    // (docs/AUTH_ARCHITECTURE.md: refresh живёт 30 дней, скользящее окно).
    if (getAccessToken()) setUser(loadStoredUser());
    setIsLoading(false);
  }, []);

  const login = useCallback(async (input: LoginDto) => {
    const response = await apiRequest<AuthResponseDto>("/auth/login", { method: "POST", body: input, auth: false });
    setTokens(response.accessToken, response.refreshToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth должен использоваться внутри AuthProvider");
  return ctx;
}
