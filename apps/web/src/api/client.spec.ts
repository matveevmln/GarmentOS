import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiDownload,
  apiRequest,
  apiUpload,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const expired = () => Response.json({ code: "ACCESS_TOKEN_EXPIRED" }, { status: 401 });
const refreshed = () => Response.json({ accessToken: "new-access", refreshToken: "new-refresh" });

describe("HTTP-клиент: восстановление сессии", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    });
    vi.stubGlobal("window", new EventTarget());
    setTokens("old-access", "old-refresh");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("одновременно восстанавливает JSON, загрузку файла и скачивание одним refresh", async () => {
    const refresh = deferred<Response>();
    const refreshStarted = deferred<void>();
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        refreshStarted.resolve();
        return refresh.promise;
      }
      const token = new Headers(options.headers).get("Authorization");
      if (token === "Bearer old-access") return Promise.resolve(expired());
      return Promise.resolve(
        url.endsWith("/download") ? new Response("pdf") : Response.json({ ok: true }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const requests = Promise.all([
      apiRequest<{ ok: boolean }>("/products"),
      apiUpload<{ ok: boolean }>("/documents", new FormData()),
      apiDownload("/download"),
    ]);
    await refreshStarted.promise;
    refresh.resolve(refreshed());
    const [json, upload, download] = await requests;
    expect(json.ok).toBe(true);
    expect(upload.ok).toBe(true);
    expect(await download.text()).toBe("pdf");
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/auth/refresh"))).toHaveLength(1);
    expect(getRefreshToken()).toBe("new-refresh");
  });

  it("сохраняет сессию при 503 на refresh и позволяет повторить запрос", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(refreshed())
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiRequest("/products")).rejects.toMatchObject({ status: 503 });
    expect(getRefreshToken()).toBe("old-refresh");
    await expect(apiRequest("/products")).resolves.toEqual({ ok: true });
  });

  it("не восстанавливает сессию, если пользователь вышел во время refresh", async () => {
    const refresh = deferred<Response>();
    const refreshStarted = deferred<void>();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/auth/refresh")) {
          refreshStarted.resolve();
          return refresh.promise;
        }
        return Promise.resolve(expired());
      }),
    );
    const request = apiRequest("/products");
    const rejected = expect(request).rejects.toMatchObject({ status: 401 });
    await refreshStarted.promise;
    clearTokens();
    refresh.resolve(refreshed());
    await rejected;
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("не делает вторую ротацию из-за запоздавшего 401 со старым access-токеном", async () => {
    const slow = deferred<Response>();
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.endsWith("/auth/refresh")) return Promise.resolve(refreshed());
      if (new Headers(options.headers).get("Authorization") === "Bearer old-access") {
        return url.endsWith("/slow") ? slow.promise : Promise.resolve(expired());
      }
      return Promise.resolve(Response.json({ ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const fast = apiRequest("/fast");
    const delayed = apiRequest("/slow");
    await fast;
    slow.resolve(expired());
    await delayed;
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("сообщает интерфейсу о завершении сессии при отклонённом refresh", async () => {
    const changed = vi.fn();
    window.addEventListener("garmentos:session-changed", changed);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(expired()).mockResolvedValueOnce(expired()),
    );
    await expect(apiRequest("/products")).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
  });

  it.each([200, 401])("ответ refresh старой сессии (%s) не меняет новый вход", async (status) => {
    const refresh = deferred<Response>();
    const refreshStarted = deferred<void>();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/auth/refresh")) {
          refreshStarted.resolve();
          return refresh.promise;
        }
        return Promise.resolve(expired());
      }),
    );
    const rejected = expect(apiRequest("/products")).rejects.toMatchObject({ status: 401 });
    await refreshStarted.promise;
    setTokens("another-access", "another-refresh");
    refresh.resolve(status === 200 ? refreshed() : expired());
    await rejected;
    expect(getAccessToken()).toBe("another-access");
    expect(getRefreshToken()).toBe("another-refresh");
  });

  it("сохраняет токены при сетевом сбое refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(expired())
        .mockRejectedValueOnce(new TypeError("Network error")),
    );
    await expect(apiRequest("/products")).rejects.toThrow("Network error");
    expect(getAccessToken()).toBe("old-access");
    expect(getRefreshToken()).toBe("old-refresh");
  });

  it("ошибка входа не запускает refresh существующей сессии", async () => {
    const fetchMock = vi.fn().mockResolvedValue(expired());
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiRequest("/auth/login", { method: "POST", auth: false })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBe("old-access");
  });
});
