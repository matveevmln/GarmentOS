// Вспомогательные функции для e2e (T01, ADR 0002) — подготовка синтетических
// данных напрямую через API (минуя браузер), когда сценарий проверяет не сам
// процесс создания карточки товара, а работу формы заказа на пошив с уже
// существующей моделью (несколько цветов на модели создаются на отдельном
// экране «Модель», не в этой форме — см. NewSewingOrderPage.tsx).
// Никаких реальных бизнес-параметров (норм расхода, цен, названий реальных
// моделей вроде «Стеганка») — только синтетические тестовые данные.

import type { Page } from "@playwright/test";

export const API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3000/v1";

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: unknown;
}

// POST /auth/login ограничен throttle'ом (5/60с, apps/api/src/auth/auth.controller.ts) —
// один реальный логин на весь файл тестов, дальше сессия переносится в
// каждую страницу через localStorage (seedAuthState), а не повторным
// проходом формы входа.
export async function loginForFixtures(email: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Не удалось войти для подготовки фикстур: ${res.status} ${await res.text()}`);
  return (await res.json()) as AuthSession;
}

// Переносит уже полученную сессию в localStorage конкретной страницы —
// та же пара ключей, что использует apps/web/src/api/client.ts и
// AuthContext.tsx (garmentos.accessToken/refreshToken/user).
export async function seedAuthState(page: Page, auth: AuthSession): Promise<void> {
  await page.goto("/login");
  await page.evaluate((a) => {
    localStorage.setItem("garmentos.accessToken", a.accessToken);
    localStorage.setItem("garmentos.refreshToken", a.refreshToken);
    localStorage.setItem("garmentos.user", JSON.stringify(a.user));
  }, auth);
}

async function apiPost<T>(path: string, accessToken: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const FIVE_SIZES = ["S", "M", "L", "XL", "XXL"] as const;

// Пример владельца проекта (docs/tasks/T01.md, п.2): 5 парных размеров,
// 600 → 75/150/150/150/75 и 400 → 50/100/100/100/50 — доли 12.5/25/25/25/12.5%.
export const OWNER_EXAMPLE_PERCENTAGES: Record<string, number> = {
  S: 12.5,
  M: 25,
  L: 25,
  XL: 25,
  XXL: 12.5,
};

export interface SeededTwoColorProduct {
  productId: string;
  productName: string;
  colorA: string;
  colorB: string;
}

// Модель с 5 размерами и ДВУМЯ цветами — форма заказа (A02/A03) не создаёт
// второй цвет модели сама (это отдельный экран карточки модели), она только
// выбирает из уже существующих цветов, поэтому готовим модель заранее.
export async function seedTwoColorProduct(accessToken: string, suffix: number): Promise<SeededTwoColorProduct> {
  const productName = `Playwright Двухцветная ${suffix}`;
  const product = await apiPost<{ id: string; name: string }>("/products", accessToken, {
    name: productName,
    code: `PW-2COLOR-${suffix}`,
  });
  await apiPost(
    `/products/${product.id}/sizes`,
    accessToken,
    { sizes: FIVE_SIZES.map((size) => ({ size, ratioWeight: 1 })) },
    "PUT",
  );
  const colorA = "Петроль";
  const colorB = "Чёрный";
  await apiPost(`/products/${product.id}/colors`, accessToken, { color: colorA, colorCode: `PETROL-${suffix}` });
  await apiPost(`/products/${product.id}/colors`, accessToken, { color: colorB, colorCode: `BLACK-${suffix}` });
  return { productId: product.id, productName, colorA, colorB };
}
