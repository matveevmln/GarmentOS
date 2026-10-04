import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthResponseDto,
  AuthenticatedUserResponseDto,
  LoginDto,
} from "@garmentos/shared-types";
import {
  apiRequest,
  clearTokens,
  getAccessToken,
  SESSION_CHANGED_EVENT,
  setTokens,
} from "../api/client";

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
    const syncSession = () => {
      if (getAccessToken()) {
        setUser(loadStoredUser());
      } else {
        localStorage.removeItem(USER_STORAGE_KEY);
        setUser(null);
      }
    };
    syncSession();
    setIsLoading(false);
    window.addEventListener(SESSION_CHANGED_EVENT, syncSession);
    window.addEventListener("storage", syncSession);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, syncSession);
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  const login = useCallback(async (input: LoginDto) => {
    const response = await apiRequest<AuthResponseDto>("/auth/login", {
      method: "POST",
      body: input,
      auth: false,
    });
    setTokens(response.accessToken, response.refreshToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("garmentos.batch-draft:")) localStorage.removeItem(key);
    }
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth должен использоваться внутри AuthProvider");
  return ctx;
}
