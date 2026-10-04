// Тонкий HTTP-клиент поверх apps/api — без сторонних библиотек (React Query и
// т.п. осознанно не добавлены на этом шаге, principles.md №3: не строим
// абстракцию заранее без доказанной необходимости на 2 пользователях).
// access/refresh-токены — та же схема, что apps/api/src/auth
// (docs/AUTH_ARCHITECTURE.md): access короткоживущий, тихо обновляется через
// refresh при 401, без повторного логина пользователя.

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000/v1";

const ACCESS_TOKEN_KEY = "garmentos.accessToken";
const REFRESH_TOKEN_KEY = "garmentos.refreshToken";
export const SESSION_CHANGED_EVENT = "garmentos:session-changed";
let sessionRevision = 0;

function notifySessionChanged(): void {
  sessionRevision += 1;
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  notifySessionChanged();
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  notifySessionChanged();
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

let refreshInFlight: { revision: number; promise: Promise<string | null> } | null = null;

// Один refresh-запрос на всех, даже если несколько запросов словили 401
// одновременно — иначе гонка создаёт две ротации одного refresh-токена и
// вторая получает REFRESH_TOKEN_REUSE_DETECTED (docs/AUTH_ARCHITECTURE.md,
// раздел 2) из-за собственного клиента, а не реальной кражи токена.
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight || refreshInFlight.revision !== sessionRevision) {
    const revision = sessionRevision;
    const promise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        return null;
      }
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      // Ответ старой сессии не должен отменить новый вход или восстановить
      // токены после выхода пользователя.
      if (revision !== sessionRevision) return null;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearTokens();
          return null;
        }
        // Временная недоступность API не означает, что refresh недействителен.
        throw new ApiError(
          response.status,
          undefined,
          `Не удалось обновить сессию (${response.status})`,
        );
      }
      const data = (await response.json()) as RefreshResponse;
      if (revision !== sessionRevision) return null;
      setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    })().finally(() => {
      if (refreshInFlight?.promise === promise) refreshInFlight = null;
    });
    refreshInFlight = { revision, promise };
  }
  return refreshInFlight.promise;
}

// Если 401 от старого запроса пришёл после завершённого refresh другого
// запроса, повторяем с уже полученным токеном без новой ротации.
async function fetchWithAuth(
  doFetch: () => Promise<Response>,
  headers: Record<string, string>,
  auth = true,
): Promise<Response> {
  const sentToken = headers.Authorization;
  let response = await doFetch();
  if (response.status === 401 && auth) {
    const currentToken = getAccessToken();
    const newToken =
      currentToken && `Bearer ${currentToken}` !== sentToken
        ? currentToken
        : await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      response = await doFetch();
    }
  }
  return response;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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

  const response = await fetchWithAuth(doFetch, headers, auth);

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

// Отдельно от apiRequest — та же схема авторизации и обновления токена, но
// тело запроса не JSON, а multipart (файл + поля формы). Content-Type здесь
// НЕ выставляется вручную: браузер сам добавит его вместе с boundary, без
// которого сервер не разберёт составной запрос.
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const doFetch = () => fetch(`${API_BASE_URL}${path}`, { method: "POST", headers, body: form });

  const response = await fetchWithAuth(doFetch, headers);

  if (!response.ok) {
    let code: string | undefined;
    let message = `Ошибка загрузки (${response.status})`;
    try {
      const errorBody = (await response.json()) as { code?: string; message?: string };
      code = errorBody.code;
      message = errorBody.message ?? message;
    } catch {
      // тело ответа не JSON — оставляем сообщение по умолчанию
    }
    throw new ApiError(response.status, code, message);
  }

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

  const response = await fetchWithAuth(doFetch, headers);

  if (!response.ok) {
    throw new ApiError(response.status, undefined, `Не удалось скачать файл (${response.status})`);
  }
  return response.blob();
}
