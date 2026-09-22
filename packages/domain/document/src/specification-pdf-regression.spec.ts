import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SPECIFICATION_TEMPLATE } from "./domain/specification-template";
import { SPECIFICATION_REGRESSION_DATA } from "./__fixtures__/specification-regression-data";
import { captureSpecificationRender, extractEmbeddedFontFamilies, type CapturedDrawCall } from "./__fixtures__/pdf-draw-capture";

// PDF-regression тест эталонной калибровки спецификации (владелец проекта,
// 2026-09-22) — коммит 566d029 зафиксировал калибровку (vertical geometry,
// horizontal paragraph justification, подписи без печатей, шрифт DejaVu
// Serif, условия оплаты, specDate, legalAddress, totalSumNoDecimals, цвет на
// отдельной строке в Products), но до сих пор это проверялось только
// вручную/на глаз. Этот тест генерирует PDF на ФИКСИРОВАННЫХ тестовых данных
// (__fixtures__/specification-regression-data.ts) и сравнивает с baseline,
// зафиксированным в репозитории — любое случайное отклонение от калибровки
// теперь падает здесь, а не остаётся незамеченным до следующей ручной сверки.
//
// Способ сравнения — НЕ побайтовое сравнение PDF (ненадёжно: pdf-lib кладёт
// в файл ID/CreationDate и порядок объектов может отличаться между
// запусками без единого визуального отличия) и не рендер в изображение
// (в проекте нет headless-браузера/image-diff библиотеки, поднимать эту
// инфраструктуру ради одного теста — решение за рамками этой задачи).
// Вместо этого — точный текстовый слой с координатами, снятый в САМОЙ
// точке истины: PDFPage.drawText перехватывается на время рендера
// (__fixtures__/pdf-draw-capture.ts), рендерер (pdf-lib-template-renderer.ts)
// не меняется ни на строку. Список вызовов drawText — это буквально "что,
// где и каким размером написано на странице", то есть vertical geometry,
// horizontal justification (позиция каждой строки внутри абзаца) и разбивка
// на строки (цвет на отдельной строке) проверяются напрямую, без риска,
// что сторонний PDF-парсер сам внесёт погрешность в измерение.
//
// Обновление baseline — см. __fixtures__/regenerate-baseline.js и
// __fixtures__/README.md: осознанное действие человека (pnpm build +
// отдельный node-скрипт), не часть автоматического прогона тестов.

const FIXTURES_DIR = join(__dirname, "__fixtures__");
const BASELINE_PDF_PATH = join(FIXTURES_DIR, "specification-regression-baseline.pdf");
const BASELINE_DRAWS_PATH = join(FIXTURES_DIR, "specification-regression-baseline-draws.json");

const POSITION_TOLERANCE_PT = 0.02;

function describeCall(call: CapturedDrawCall): string {
  const preview = call.text.length > 40 ? `${call.text.slice(0, 40)}…` : call.text;
  return `«${preview}» (стр.${call.pageIndex}, x=${call.x.toFixed(2)}, y=${call.y.toFixed(2)}, size=${call.size})`;
}

function diffDrawCalls(baseline: CapturedDrawCall[], current: CapturedDrawCall[]): string[] {
  const diffs: string[] = [];
  if (baseline.length !== current.length) {
    diffs.push(
      `количество элементов текста изменилось: было ${baseline.length}, стало ${current.length} — вероятно, добавился/пропал абзац, строка таблицы или изменилась перепаковка строк по ширине`,
    );
    return diffs;
  }
  for (let i = 0; i < baseline.length; i += 1) {
    const before = baseline[i];
    const after = current[i];
    if (before.text !== after.text) {
      diffs.push(`элемент #${i}: текст изменился: "${before.text}" → "${after.text}"`);
      continue;
    }
    if (before.pageIndex !== after.pageIndex) {
      diffs.push(`элемент #${i} ${describeCall(before)}: переместился со страницы ${before.pageIndex} на ${after.pageIndex}`);
    }
    if (before.size !== after.size) {
      diffs.push(`элемент #${i} ${describeCall(before)}: размер шрифта изменился ${before.size} → ${after.size}`);
    }
    const dx = after.x - before.x;
    if (Math.abs(dx) > POSITION_TOLERANCE_PT) {
      diffs.push(
        `элемент #${i} ${describeCall(before)}: горизонтальное смещение (paragraph justification/поля) изменилось на ${dx.toFixed(2)}pt (было x=${before.x.toFixed(2)}, стало x=${after.x.toFixed(2)})`,
      );
    }
    const dy = after.y - before.y;
    if (Math.abs(dy) > POSITION_TOLERANCE_PT) {
      diffs.push(
        `элемент #${i} ${describeCall(before)}: вертикальное смещение (vertical geometry) изменилось на ${dy.toFixed(2)}pt (было y=${before.y.toFixed(2)}, стало y=${after.y.toFixed(2)})`,
      );
    }
  }
  return diffs;
}

describe("PDF-regression: эталонная калибровка спецификации (566d029)", () => {
  it("сгенерированный PDF на фиксированных данных совпадает с baseline по тексту и координатам", async () => {
    const baselineDraws = JSON.parse(readFileSync(BASELINE_DRAWS_PATH, "utf-8")) as {
      pageCount: number;
      calls: CapturedDrawCall[];
    };
    const current = await captureSpecificationRender(DEFAULT_SPECIFICATION_TEMPLATE, SPECIFICATION_REGRESSION_DATA);

    const diffs = diffDrawCalls(baselineDraws.calls, current.calls);
    expect(diffs, diffs.join("\n")).toEqual([]);
  });

  it("количество страниц не изменилось относительно baseline", async () => {
    const baselineDraws = JSON.parse(readFileSync(BASELINE_DRAWS_PATH, "utf-8")) as { pageCount: number };
    const current = await captureSpecificationRender(DEFAULT_SPECIFICATION_TEMPLATE, SPECIFICATION_REGRESSION_DATA);
    const maxPageIndex = current.calls.reduce((max, call) => Math.max(max, call.pageIndex), 0);
    expect(
      maxPageIndex + 1,
      `ожидалось ${baselineDraws.pageCount} страниц(а), фактически задействовано ${maxPageIndex + 1} — контент "переполз" на другую страницу`,
    ).toBe(baselineDraws.pageCount);
  });

  it("шрифт остаётся DejaVu Serif (обычный и жирный) — калибровка 2026-09-17, тот же файл эталона", async () => {
    const current = await captureSpecificationRender(DEFAULT_SPECIFICATION_TEMPLATE, SPECIFICATION_REGRESSION_DATA);
    const fonts = await extractEmbeddedFontFamilies(current.pdfBytes);
    expect(fonts.hasRegular, "в PDF не найден встроенный шрифт DejaVuSerif (обычное начертание)").toBe(true);
    expect(fonts.hasBold, "в PDF не найден встроенный шрифт DejaVuSerif-Bold (жирное начертание)").toBe(true);
  });

  it("baseline-файл существует и читается (регенерация baseline — осознанное действие человека, см. __fixtures__/regenerate-baseline.js)", () => {
    const bytes = readFileSync(BASELINE_PDF_PATH);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
