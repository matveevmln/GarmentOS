// Тонкий HTTP-клиент поверх apps/api — без сторонних библиотек (React Query и
// т.п. осознанно не добавлены на этом шаге, principles.md №3: не строим
// абстракцию заранее без доказанной необходимости на 2 пользователях).
// access/refresh-токены — та же схема, что apps/api/src/auth
// (docs/AUTH_ARCHITECTURE.md): access короткоживущий, тихо обновляется через
// refresh при 401, без повторного логина пользователя.

export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000/v1";

const ACCESS_TOKEN_KEY = "garmentos.accessToken";
const REFRESH_TOKEN_KEY = "garmentos.refreshToken";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

let refreshInFlight: Promise<string | null> | null = null;

// Один refresh-запрос на всех, даже если несколько запросов словили 401
// одновременно — иначе гонка создаёт две ротации одного refresh-токена и
// вторая получает REFRESH_TOKEN_REUSE_DETECTED (docs/AUTH_ARCHITECTURE.md,
// раздел 2) из-за собственного клиента, а не реальной кражи токена.
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return null;
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        clearTokens();
        return null;
      }
      const data = (await response.json()) as RefreshResponse;
      setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const doFetch = () =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let response = await doFetch();

  if (response.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      response = await doFetch();
    }
  }

  if (!response.ok) {
    let code: string | undefined;
    let message = `Ошибка запроса (${response.status})`;
    try {
      const errorBody = (await response.json()) as { code?: string; message?: string };
      code = errorBody.code;
      message = errorBody.message ?? message;
    } catch {
      // тело ответа не JSON — оставляем сообщение по умолчанию
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// Отдельно от apiRequest — та же схема авторизации/refresh, но ответ не
// JSON (PDF), а бинарные данные (Паспорт партии, раздел «Документы»:
// «Открыть» должен реально открыть файл, не просто показать его имя).
export async function apiDownload(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const doFetch = () => fetch(`${API_BASE_URL}${path}`, { headers });

  let response = await doFetch();
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      response = await doFetch();
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, undefined, `Не удалось скачать файл (${response.status})`);
  }
  return response.blob();
}
