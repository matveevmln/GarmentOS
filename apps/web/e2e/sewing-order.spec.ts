import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  API_BASE_URL,
  loginForFixtures,
  seedAuthState,
  seedTwoColorProduct,
  OWNER_EXAMPLE_PERCENTAGES,
  FIVE_SIZES,
  type AuthSession,
} from "./fixtures";

// T01 (docs/tasks/T01.md, ADR 0002) — сквозной проход A02/A03/B01 в реальном
// браузере на тестовой БД. Учётные данные и адрес API/веб — из переменных
// окружения (см. docs/reports/T01.md, раздел «Проход в браузере», точные
// команды запуска серверов и бутстрапа компании).
const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? "playwright-t01@example.com";
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? "playwright-test-12345";

// POST /auth/login ограничен throttle'ом 5 запросов/60с — один реальный вход
// на весь файл (beforeAll), дальше сессия переносится в каждую страницу
// через localStorage, не через повторный проход формы (иначе 5-6 тестов
// этого файла упираются в 429 и последний тест виснет на waitForURL).
let sharedAuth: AuthSession;

test.beforeAll(async () => {
  sharedAuth = await loginForFixtures(EMAIL, PASSWORD);
});

async function authenticate(page: Page) {
  await seedAuthState(page, sharedAuth);
  await page.goto("/dashboard");
}

// rowIndex — порядковый номер цвета ВНУТРИ конкретной модели (data-testid
// "color-row-N" уникален только в пределах одного model-block, у второй
// модели тоже будет свой "color-row-0") — поэтому modelScope обязателен,
// просто page.getByTestId по всей странице даёт коллизию при >1 модели.
async function selectColorInRow(page: Page, modelScope: Locator, rowIndex: number, colorName: string) {
  await modelScope.getByTestId(`color-row-${rowIndex}`).getByTestId("color-select").click();
  await page.getByRole("option", { name: colorName, exact: true }).click();
}

// NumberInput/PercentInput коммитят значение в React-состояние по blur, не по
// keystroke (design-system/Input/NumberInput.tsx) — Tab для блюра оказался
// ненадёжен при повторном редактировании одного и того же поля подряд
// (React иногда не успевал перерендерить между input- и blur-событиями,
// вызывая гонку с устаревшим замыканием onBlur). Явный нативный blur() после
// fill() — детерминированный способ дождаться коммита перед следующим шагом.
async function commitNumber(input: Locator, value: string) {
  // .fill() иногда не полностью заменяет уже отформатированное (после blur)
  // значение при повторном редактировании одного и того же поля — вручную
  // выделяем всё и удаляем перед вводом нового значения.
  await input.click();
  await input.press("ControlOrMeta+a");
  await input.press("Backspace");
  await input.fill(value);
  await input.evaluate((el: HTMLInputElement) => el.blur());
}

async function fillPercentagesInRow(modelScope: Locator, rowIndex: number) {
  const row = modelScope.getByTestId(`color-row-${rowIndex}`);
  for (const size of FIVE_SIZES) {
    await commitNumber(row.getByTestId(`percent-${size}`), String(OWNER_EXAMPLE_PERCENTAGES[size]));
  }
}

test("A02→A03→B01: два цвета одной модели по примеру владельца, вторая модель, обе партии в штабе", async ({ page }) => {
  const suffix = Date.now();
  const seeded = await seedTwoColorProduct(sharedAuth.accessToken, suffix);

  await authenticate(page);

  // «+ Заказ на пошив» из списка заказов (A02: пустой черновик).
  await page.goto("/sewing-orders");
  await page.getByTestId("new-sewing-order").click();
  await page.waitForURL(/\/sewing-orders\/[^/]+\/edit$/);

  // Цех создаётся прямо в форме, не уходя со страницы (A02).
  await page.getByRole("tab", { name: "+ Добавить цех" }).click();
  const workshopName = `Playwright Цех ${suffix}`;
  await page.getByTestId("new-workshop-name").fill(workshopName);
  await page.getByTestId("save-workshop").click();
  await expect(page.getByRole("button", { name: workshopName })).toBeVisible();

  // Первая модель — уже существующая, с двумя цветами (заведены заранее через
  // API теми же двумя эндпоинтами, что вызывает ModelSizesAndColorsSetup —
  // сама форма заказа не создаёт второй цвет модели, это происходит на
  // отдельном экране карточки модели).
  await page.getByTestId("add-model-block").click();
  const model0 = page.getByTestId("model-block-0");
  await model0.getByRole("button", { name: "Выберите модель..." }).click();
  await page.getByRole("option", { name: seeded.productName, exact: true }).click();
  await expect(model0.getByTestId("unit-price")).toBeVisible();
  await commitNumber(model0.getByTestId("unit-price"), "500");

  // Цвет 1 — пример владельца: 600 → 75/150/150/150/75 (docs/tasks/T01.md, п.2).
  await model0.getByTestId("add-color").click();
  await selectColorInRow(page, model0, 0, seeded.colorA);
  await commitNumber(model0.getByTestId("color-row-0").getByTestId("color-quantity"), "600");
  await fillPercentagesInRow(model0, 0);
  await expect(model0.getByTestId("color-row-0").getByTestId("percent-sum")).toContainText("100.0%");
  const preview0 = model0.getByTestId("color-row-0").getByTestId("distribution-preview");
  await expect(preview0).toContainText("S — 75");
  await expect(preview0).toContainText("M — 150");
  await expect(preview0).toContainText("L — 150");
  await expect(preview0).toContainText("XL — 150");
  await expect(preview0).toContainText("XXL — 75");
  await expect(preview0).toContainText("итого 600");

  // Цвет 2 — тот же пример на 400 → 50/100/100/100/50.
  await model0.getByTestId("add-color").click();
  await selectColorInRow(page, model0, 1, seeded.colorB);
  await commitNumber(model0.getByTestId("color-row-1").getByTestId("color-quantity"), "400");
  await fillPercentagesInRow(model0, 1);
  const preview1 = model0.getByTestId("color-row-1").getByTestId("distribution-preview");
  await expect(preview1).toContainText("S — 50");
  await expect(preview1).toContainText("M — 100");
  await expect(preview1).toContainText("итого 400");

  // Некорректные доли (T01, приёмка) — портим сумму, форма показывает
  // предупреждение и не даёт разместить заказ, затем возвращаем как было.
  const sPercentRow0 = model0.getByTestId("color-row-0").getByTestId("percent-S");
  await commitNumber(sPercentRow0, "20");
  await expect(model0.getByTestId("color-row-0").getByTestId("percent-sum")).toContainText("должно быть 100%");
  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("place-error")).toContainText("100%");
  await expect(page).not.toHaveURL(/\/sewing-orders\/[^/]+$/);
  await commitNumber(sPercentRow0, "12.5");
  await expect(model0.getByTestId("color-row-0").getByTestId("percent-sum")).toContainText("100.0%");

  // Вторая модель заказа — новая, создаётся тут же (A03), с одним цветом.
  await page.getByTestId("add-model-block").click();
  const model1 = page.getByTestId("model-block-1");
  await model1.getByRole("tab", { name: "+ Добавить модель" }).click();
  const modelName = `Playwright Худи ${suffix}`;
  const modelCode = `PW-HOODIE-${suffix}`;
  await model1.getByTestId("new-model-name").fill(modelName);
  await model1.getByTestId("new-model-code").fill(modelCode);
  await model1.getByTestId("save-model").click();

  // У новой модели ещё нет размеров/цветов — форма предлагает добавить тут же.
  await model1.getByTestId("size-row-0").fill("M");
  await model1.getByRole("button", { name: "Сохранить размерный ряд" }).click();
  await model1.getByTestId("new-color-name").fill("Синий");
  await model1.getByTestId("new-color-code").fill(`BLUE-${suffix}`);
  await model1.getByRole("button", { name: "Сохранить цвет и продолжить" }).click();

  await commitNumber(model1.getByTestId("unit-price"), "500");
  await model1.getByTestId("add-color").click();
  await commitNumber(model1.getByTestId("color-quantity"), "20");

  // Автосохранение (A02) — дожидаемся статуса перед перезагрузкой.
  await expect(page.getByTestId("save-status")).toContainText("Сохранено", { timeout: 8000 });

  const draftUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByText(seeded.productName)).toBeVisible();
  await expect(page.getByText(modelName)).toBeVisible();
  await expect(page.getByTestId("model-block-0").getByTestId("unit-price")).toHaveValue(/500/);
  await expect(page.getByTestId("model-block-0").getByTestId("color-row-0").getByTestId("color-quantity")).toHaveValue(/600/);
  await expect(page.getByTestId("model-block-0").getByTestId("color-row-1").getByTestId("color-quantity")).toHaveValue(/400/);
  await expect(page.getByTestId("model-block-1").getByTestId("color-quantity")).toHaveValue(/20/);
  await expect(page.getByText(workshopName)).toBeVisible();

  // «Создать заказ» — атомарное размещение одним действием, открывает штаб
  // (B01 basic) с партиями ОБЕИХ моделей.
  await page.getByTestId("place-order").click();
  await page.waitForURL(/\/sewing-orders\/[^/]+$/);
  await expect(page.getByText(/Заказ №\d+/)).toBeVisible();
  await expect(page.getByText(seeded.productName)).toBeVisible();
  await expect(page.getByText(modelName)).toBeVisible();
  const productionOrderCards = page.getByTestId("production-order-card");
  await expect(productionOrderCards).toHaveCount(2);
  await expect(productionOrderCards.getByText("Размещён")).toHaveCount(2);

  // Список заказов на пошив видит новый заказ.
  await page.goto("/sewing-orders");
  await expect(page.getByText(workshopName)).toBeVisible();
});

test("повторный вход в размещённый заказ через «Заказы на пошив» открывает штаб, не форму", async ({ page }) => {
  await authenticate(page);

  await page.getByRole("link", { name: "Заказы на пошив" }).click();
  await page.waitForURL(/\/sewing-orders$/);
  const firstOrderCard = page.getByText(/Заказ №\d+/).first();
  await expect(firstOrderCard).toBeVisible();
  await firstOrderCard.click();
  await page.waitForURL(/\/sewing-orders\/[^/]+$/);
  await expect(page.getByText("Открыть партию →").first()).toBeVisible();
});

test("две вкладки: устаревшая версия автосейва получает видимую ошибку конфликта, не тихую перезапись", async ({ browser }) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await authenticate(pageA);
  await pageA.goto("/sewing-orders");
  await pageA.getByTestId("new-sewing-order").click();
  await pageA.waitForURL(/\/sewing-orders\/[^/]+\/edit$/);
  const draftUrl = pageA.url();

  // Вторая вкладка — тот же браузерный контекст (общий localStorage/токен,
  // как две вкладки одного пользователя), открывает тот же черновик
  // (version=1 в обеих на старте).
  await pageB.goto(draftUrl);
  await expect(pageB.getByTestId("add-model-block")).toBeVisible();

  // В первой вкладке меняем цех — автосохранение поднимает version до 2.
  const suffix = Date.now();
  await pageA.getByRole("tab", { name: "+ Добавить цех" }).click();
  const workshopName = `Playwright Конфликт ${suffix}`;
  await pageA.getByTestId("new-workshop-name").fill(workshopName);
  await pageA.getByTestId("save-workshop").click();
  await expect(pageA.getByTestId("save-status")).toContainText("Сохранено", { timeout: 8000 });

  // Во второй вкладке (всё ещё version=1) вносим независимое изменение —
  // её автосейв уходит со старым version и должен получить 409, не тихую
  // перезапись версии, сохранённой первой вкладкой.
  await pageB.getByTestId("add-model-block").click();
  await expect(pageB.getByTestId("save-status")).toContainText("Не сохранено — повторить", { timeout: 8000 });
  await expect(pageB.getByTestId("save-status")).toContainText("изменён в другой вкладке");

  await context.close();
});

test("неработающий API: автосохранение показывает ошибку, введённые данные не теряются", async ({ page }) => {
  await authenticate(page);
  await page.goto("/sewing-orders");
  await page.getByTestId("new-sewing-order").click();
  await page.waitForURL(/\/sewing-orders\/[^/]+\/edit$/);

  await page.route("**/v1/sewing-orders/*", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Внутренняя ошибка" }) });
      return;
    }
    await route.continue();
  });

  const suffix = Date.now();
  await page.getByRole("tab", { name: "+ Добавить цех" }).click();
  const workshopName = `Playwright Офлайн ${suffix}`;
  await page.getByTestId("new-workshop-name").fill(workshopName);
  await page.getByTestId("save-workshop").click();

  await expect(page.getByTestId("save-status")).toContainText("Не сохранено — повторить", { timeout: 8000 });
  // Введённые данные остаются на экране, несмотря на неудачное автосохранение.
  await expect(page.getByRole("button", { name: workshopName })).toBeVisible();

  await page.unroute("**/v1/sewing-orders/*");
});

test.describe("мобильная ширина", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("форма нового заказа открывается без горизонтального скролла, кнопка «Создать заказ» доступна", async ({ page }) => {
    await authenticate(page);
    await page.goto("/sewing-orders");
    await page.getByTestId("new-sewing-order").click();
    await page.waitForURL(/\/sewing-orders\/[^/]+\/edit$/);
    await expect(page.getByText("Новый заказ на пошив")).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalScroll).toBe(false);

    await expect(page.getByTestId("place-order")).toBeVisible();
  });
});

// T01-REVIEW-FIXES.md п.2 — сервер принял POST /place и сохранил результат,
// но ответ на этот конкретный запрос клиент не получил (обрыв соединения).
// Оригинальный POST реально отправляется на сервер (через прямой fetch
// внутри перехватчика), после чего перехваченный запрос СТРАНИЦЫ обрывается
// (route.abort) — так проверяется именно «сервер выполнил, ответ потерян»,
// а не отказ сервера. GET-восстановление в самом catch у handlePlace тоже
// намеренно обрывается один раз, чтобы отдельно проверить второй рубеж
// защиты — обнаружение уже размещённого заказа при обычной перезагрузке.
test("восстановление после потерянного ответа: сервер разместил заказ, ответ потерян, перезагрузка открывает тот же штаб", async ({ page }) => {
  await authenticate(page);
  const suffix = Date.now();

  await page.goto("/sewing-orders");
  await page.getByTestId("new-sewing-order").click();
  await page.waitForURL(/\/sewing-orders\/[^/]+\/edit$/);

  await page.getByRole("tab", { name: "+ Добавить цех" }).click();
  const workshopName = `Playwright Потеря ${suffix}`;
  await page.getByTestId("new-workshop-name").fill(workshopName);
  await page.getByTestId("save-workshop").click();
  await expect(page.getByRole("button", { name: workshopName })).toBeVisible();

  await page.getByTestId("add-model-block").click();
  const model0 = page.getByTestId("model-block-0");
  await model0.getByRole("tab", { name: "+ Добавить модель" }).click();
  const modelName = `Playwright Потеряшка ${suffix}`;
  await model0.getByTestId("new-model-name").fill(modelName);
  await model0.getByTestId("new-model-code").fill(`PW-LOST-${suffix}`);
  await model0.getByTestId("save-model").click();
  // Размерный ряд по умолчанию — уже пять парных размеров Стеганки.
  await model0.getByRole("button", { name: "Сохранить размерный ряд" }).click();
  await model0.getByTestId("new-color-name").fill("Графит");
  await model0.getByTestId("new-color-code").fill(`GRAPHITE-${suffix}`);
  await model0.getByRole("button", { name: "Сохранить цвет и продолжить" }).click();
  await commitNumber(model0.getByTestId("unit-price"), "500");
  await model0.getByTestId("add-color").click();
  await commitNumber(model0.getByTestId("color-quantity"), "20");
  await expect(page.getByTestId("save-status")).toContainText("Сохранено", { timeout: 8000 });

  let placeRequestsSeen = 0;
  let recoveryGetSeen = 0;
  await page.route("**/v1/sewing-orders/*/place", async (route) => {
    placeRequestsSeen += 1;
    const req = route.request();
    const originalHeaders = req.headers();
    // Реальный запрос уходит на сервер напрямую — заказ действительно
    // размещается, но перехваченный запрос страницы получит обрыв связи.
    // Только нужные заголовки — пересылать content-length/connection от
    // оригинального запроса неверно, тело формируется заново.
    await fetch(req.url(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: originalHeaders.authorization },
      body: req.postData() ?? undefined,
    });
    await route.abort("failed");
  });
  await page.route("**/v1/sewing-orders/*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    recoveryGetSeen += 1;
    if (recoveryGetSeen === 1) {
      // Первая попытка клиента проверить статус после потери ответа тоже
      // обрывается — проверяем именно рубеж «перезагрузка», не только
      // мгновенное восстановление внутри того же клика.
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });

  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("place-error")).toBeVisible({ timeout: 8000 });
  expect(placeRequestsSeen).toBe(1);

  await page.unroute("**/v1/sewing-orders/*/place");
  await page.unroute("**/v1/sewing-orders/*");

  // Перезагрузка — форма запрашивает статус заново, без перехвата, и должна
  // обнаружить, что заказ уже размещён на сервере, открыв штаб вместо формы.
  await page.reload();
  await page.waitForURL(/\/sewing-orders\/[^/]+$/, { timeout: 8000 });
  await expect(page.getByText(/Заказ №\d+/).first()).toBeVisible();
  await expect(page.getByText(modelName)).toBeVisible();
  await expect(page.getByTestId("production-order-card")).toHaveCount(1);

  // Повторный вызов «Создать заказ» с тем же ключом (если бы форма всё ещё
  // была открыта) не создал бы вторую группу партий — проверено на уровне
  // API отдельным e2e-тестом (sewing-orders.e2e.spec.ts, идемпотентность).
  await page.goto("/sewing-orders");
  await expect(page.getByText(workshopName)).toBeVisible();
});

// T01-REVIEW-FIXES.md п.3 — Стеганка: пользователь добавляет свой размер и
// свой цвет вручную; запись должна попасть в общий справочник компании и
// предлагаться при заполнении СЛЕДУЮЩЕЙ модели, в том числе после
// перезагрузки страницы — не только в рамках уже открытой формы.
test("сохранение пользовательских размеров и цветов: свой размер/цвет предлагается в следующей модели после перезагрузки", async ({ page }) => {
  await authenticate(page);
  const suffix = Date.now();
  const customSize = `ОСОБЫЙ-${suffix}`;
  const customColor = `Изумрудный ${suffix}`;

  await page.goto("/sewing-orders");
  await page.getByTestId("new-sewing-order").click();
  await page.waitForURL(/\/sewing-orders\/[^/]+\/edit$/);

  await page.getByRole("tab", { name: "+ Добавить цех" }).click();
  await page.getByTestId("new-workshop-name").fill(`Playwright Размеры ${suffix}`);
  await page.getByTestId("save-workshop").click();

  // Первая модель — стандартные размеры Стеганки плюс один добавленный
  // вручную нестандартный размер, и цвет, введённый вручную.
  await page.getByTestId("add-model-block").click();
  const model0 = page.getByTestId("model-block-0");
  await model0.getByRole("tab", { name: "+ Добавить модель" }).click();
  await model0.getByTestId("new-model-name").fill(`Playwright Размерная ${suffix}`);
  await model0.getByTestId("new-model-code").fill(`PW-SIZE-${suffix}`);
  await model0.getByTestId("save-model").click();
  await model0.getByRole("button", { name: "+ Добавить размер" }).click();
  await model0.getByTestId("size-row-5").fill(customSize);
  await model0.getByRole("button", { name: "Сохранить размерный ряд" }).click();
  await model0.getByTestId("new-color-name").fill(customColor);
  await model0.getByTestId("new-color-code").fill(`EMERALD-${suffix}`);
  await model0.getByRole("button", { name: "Сохранить цвет и продолжить" }).click();
  await expect(page.getByTestId("save-status")).toContainText("Сохранено", { timeout: 8000 });

  // Перезагрузка — подсказки размеров/цветов должны прийти заново с сервера,
  // не только жить в памяти текущей вкладки.
  await page.reload();
  await expect(page.getByTestId("model-block-0")).toBeVisible();

  // Вторая, независимая модель того же заказа — её собственная форма
  // добавления размеров/цветов должна предложить то, что было введено в
  // первой модели, через общий справочник компании.
  await page.getByTestId("add-model-block").click();
  const model1 = page.getByTestId("model-block-1");
  await model1.getByRole("tab", { name: "+ Добавить модель" }).click();
  await model1.getByTestId("new-model-name").fill(`Playwright Размерная-2 ${suffix}`);
  await model1.getByTestId("new-model-code").fill(`PW-SIZE2-${suffix}`);
  await model1.getByTestId("save-model").click();

  await expect(page.locator(`#sewing-order-size-presets option[value="${customSize}"]`)).toHaveCount(1);
  await model1.getByRole("button", { name: "Сохранить размерный ряд" }).click();
  await expect(page.locator(`#sewing-order-color-presets option[value="${customColor}"]`)).toHaveCount(1);
});

// T01-REVIEW-FIXES.md п.4 — пустой черновик можно удалить из списка, после
// чего пользователь остаётся на списке без него; размещённые заказы не
// предлагают действие удаления (проверено отсутствием кнопки на карточке).
test("удаление пустого черновика: карточка исчезает из списка, у размещённых заказов кнопки удаления нет", async ({ page }) => {
  await authenticate(page);
  await page.goto("/sewing-orders");
  await page.getByTestId("new-sewing-order").click();
  await page.waitForURL(/\/sewing-orders\/[^/]+\/edit$/);
  const draftId = page.url().match(/\/sewing-orders\/([^/]+)\/edit$/)?.[1];
  if (!draftId) throw new Error("Не удалось извлечь id черновика из URL");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.goto("/sewing-orders");
  await expect(page.getByTestId(`delete-draft-${draftId}`)).toBeVisible();
  await page.getByTestId(`delete-draft-${draftId}`).click();
  await expect(page.getByTestId(`delete-draft-${draftId}`)).toHaveCount(0);

  // Размещённый заказ (из другого теста этого файла) не должен показывать
  // кнопку «Удалить» вовсе — статус не draft.
  const orders = await (await fetch(`${API_BASE_URL}/sewing-orders`, {
    headers: { Authorization: `Bearer ${sharedAuth.accessToken}` },
  })).json() as Array<{ id: string; status: string }>;
  const placed = orders.find((order) => order.status === "placed");
  if (!placed) throw new Error("Ожидался хотя бы один размещённый заказ от предыдущих тестов файла");
  await expect(page.getByTestId(`sewing-order-card-${placed.id}`)).toBeVisible();
  await expect(page.getByTestId(`sewing-order-card-${placed.id}`).getByRole("button", { name: "Удалить" })).toHaveCount(0);
});
