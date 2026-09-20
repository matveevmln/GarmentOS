import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import { applyPlaceholders, type SpecificationDocumentData, type SpecificationTemplateDefinition } from "../domain/specification-template";
import type { DocumentRenderAdapter } from "../application/ports";
import {
  buildCuttingOrderColumns,
  type CuttingOrderDocumentData,
  type TableColumn,
} from "../domain/cutting-order-template";

// pdf-lib — программная раскладка без headless-браузера (docs/TECH_STACK.md,
// раздел "Document Engine — генерация PDF"). Document Template Engine
// (docs/DOCUMENT_ENGINE_ARCHITECTURE.md, раздел 2, расширено 2026-07-26) —
// этот рендерер не хардкодит ни один документ: он раскладывает переданную
// SpecificationTemplateDefinition (структура) + SpecificationDocumentData
// (значения) в PDF. Разные шаблоны для разных цехов/компаний — то же самое
// вызывает этот же рендерер с другим объектом-шаблоном.
//
// Стандартные 14 PDF-шрифтов не умеют кириллицу (проверено вручную —
// см. git-историю) — оба шрифта встроены из assets/fonts/, не зависят от
// шрифтов, установленных в ОС (cloud-agnostic, docs/INFRASTRUCTURE.md).
// Liberation Serif — метрически совместим с Times New Roman, используется в
// renderCuttingOrder (для раскройного задания эталона нет, шрифт не менялся).
// renderSpecification — DejaVu Serif (Bitstream Vera License, свободно
// распространяется), а не Liberation Serif: read-only проверка через
// pdfplumber (ПРОМПТ №10.3, владелец проекта, 2026-09-17) на самом файле
// эталона (/root/.claude/uploads/.../"Спецификация №7") показала embedded
// fontname "DejaVuSerif"/"DejaVuSerif-Bold" — прежнее указание "тот же
// шрифт, что в эталоне" (2026-07-26) никогда не было фактически сверено и
// оказалось неверным.
const FONTS_DIR = join(__dirname, "..", "..", "assets", "fonts");
// Размер страницы и поля измерены напрямую по MediaBox и вертикальным
// границам таблицы эталонного документа (ПРОМПТ №2.2, фактическая проверка
// pypdf/pdfplumber, спецификация №7 к договору №П-22-04) — стандартный A4
// (595.2756×841.8898pt), НЕ 612×842 (более раннее предположение было
// ошибочным — исправлено). Поле 60.94pt с каждой стороны даёт ширину
// содержимого ровно 473.4pt — сумму измеренных ширин колонок таблицы.
const PAGE_WIDTH = 595.2756;
const PAGE_HEIGHT = 841.8898;
const MARGIN = 60.94;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

interface DrawContext {
  pdfDoc: PDFDocument;
  font: PDFFont;
  boldFont: PDFFont;
  page: PDFPage;
  y: number;
  // Верхнее/нижнее поле НЕ обязано совпадать с левым/правым MARGIN (60.94pt,
  // используется для ширины контента и уже подтверждён по вертикальным
  // границам таблицы эталона) — контекст по умолчанию наследует старое
  // симметричное значение (renderCuttingOrder, без эталона для сверки),
  // renderSpecification передаёт свои поля, измеренные напрямую по эталону
  // (см. константы SPEC_TOP_MARGIN/SPEC_BOTTOM_MARGIN ниже) — правка не
  // затрагивает раскройное задание.
  topMargin: number;
  bottomMargin: number;
}

// Разбивает ОДИН абзац (без \n внутри) на строки по ширине — вызывающий код
// (drawParagraph) сам разбивает текст по \n на абзацы, чтобы знать, какая
// строка последняя в своём абзаце (нужно для выравнивания по ширине —
// последняя строка абзаца никогда не растягивается, см. drawJustifiedLine).
function wrapParagraphLines(font: PDFFont, paragraph: string, size: number, maxWidth: number): string[] {
  const words = paragraph.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

function ensureSpace(ctx: DrawContext, needed: number): void {
  if (ctx.y - needed < ctx.bottomMargin) {
    ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.y = PAGE_HEIGHT - ctx.topMargin;
  }
}

// Выравнивание по ширине (justify) — эталонный документ растягивает
// межсловные пробелы так, что каждая строка абзаца, кроме последней,
// доходит точно до правого края (владелец проекта, 2026-08-03: сверено
// визуально с присланным оригиналом — правый край первой строки пункта 1 и
// пункта 2 совпадает с правой границей таблицы, последняя строка каждого
// абзаца остаётся обычной, нерастянутой длины).
function drawJustifiedLine(ctx: DrawContext, line: string, font: PDFFont, size: number, x0: number, targetWidth: number): void {
  const words = line.split(" ");
  if (words.length <= 1) {
    ctx.page.drawText(line, { x: x0, y: ctx.y, size, font, color: rgb(0, 0, 0) });
    return;
  }
  const naturalWidth = font.widthOfTextAtSize(line, size);
  const spaceWidth = font.widthOfTextAtSize(" ", size);
  const extraPerGap = (targetWidth - naturalWidth) / (words.length - 1);
  let x = x0;
  for (const word of words) {
    ctx.page.drawText(word, { x, y: ctx.y, size, font, color: rgb(0, 0, 0) });
    x += font.widthOfTextAtSize(word, size) + spaceWidth + extraPerGap;
  }
}

function drawParagraph(
  ctx: DrawContext,
  text: string,
  options: {
    bold?: boolean;
    size?: number;
    align?: "left" | "right" | "center";
    justify?: boolean;
    gapAfter?: number;
    // Переопределение межстрочного интервала — по умолчанию формула
    // size+1.5 (используется renderCuttingOrder, для которого эталона нет и
    // трогать нельзя). renderSpecification передаёт значения, измеренные
    // напрямую по эталону (ПРОМПТ №10.3, эталон в /root/.claude/uploads,
    // спецификация №7): 11.0pt для основного текста 9pt, 12.0/13.0pt для
    // заголовка.
    lineHeight?: number;
    // Левая граница и ширина текстового блока — по умолчанию MARGIN/
    // CONTENT_WIDTH (используется renderCuttingOrder и центрированным
    // заголовком спецификации — трогать нельзя, эталона для первого нет,
    // для второго центрирование уже совпадает: узкая рамка симметрична,
    // центр не сдвигается). renderSpecification передаёт для левого/
    // justify-текста пунктов 1-10 узкую рамку, измеренную напрямую по
    // эталону (ПРОМПТ №11.6, владелец проекта, 2026-09-20).
    leftMargin?: number;
    contentWidth?: number;
  } = {},
): void {
  const size = options.size ?? 10.5;
  const font = options.bold ? ctx.boldFont : ctx.font;
  const lineHeight = options.lineHeight ?? size + 1.5;
  const leftMargin = options.leftMargin ?? MARGIN;
  const contentWidth = options.contentWidth ?? CONTENT_WIDTH;

  // Пустая строка ("\n\n") — граница между двумя самостоятельными абзацами
  // одного пункта (эталон: пункт 2 "Условия платежа" — два абзаца с тем же
  // интервалом, что между пунктами 2-10, не просто перенос строки внутри
  // одного абзаца). Одиночный "\n" — перенос строки без межабзацного отступа
  // (сохранено для обратной совместимости, ни один текущий шаблон его не
  // использует).
  const blocks = text.split(/\n\s*\n/);
  blocks.forEach((block) => {
    for (const paragraph of block.split("\n")) {
      const lines = wrapParagraphLines(font, paragraph, size, contentWidth);
      lines.forEach((line, index) => {
        ensureSpace(ctx, lineHeight);
        const isLastLineOfParagraph = index === lines.length - 1;
        if (options.justify && !isLastLineOfParagraph && !options.align) {
          drawJustifiedLine(ctx, line, font, size, leftMargin, contentWidth);
        } else {
          const width = font.widthOfTextAtSize(line, size);
          const x =
            options.align === "center"
              ? MARGIN + (CONTENT_WIDTH - width) / 2
              : options.align === "right"
                ? MARGIN + CONTENT_WIDTH - width
                : leftMargin;
          ctx.page.drawText(line, { x, y: ctx.y, size, font, color: rgb(0, 0, 0) });
        }
        ctx.y -= lineHeight;
      });
    }
    ctx.y -= options.gapAfter ?? 4;
  });
}

// Обобщённая отрисовка таблицы: колонки и готовые строки. Раньше функция
// знала форму данных спецификации (жёсткий маппинг семи ключей и строка
// «Итого»); теперь она рисует любую таблицу, а «что это за колонки» решает
// вызывающий — так раскройное задание с колонкой на каждый цвет использует
// тот же код, а не второй генератор.
//
// Шапка перерисовывается на каждой новой странице: до этого при переносе
// таблица продолжалась без заголовков.
function drawTableRows(
  ctx: DrawContext,
  columns: readonly TableColumn[],
  rows: ReadonlyArray<Record<string, string>>,
  totalRow?: Record<string, string>,
  // Межстрочный интервал внутри ячейки и отступ после таблицы —
  // необязательные переопределения (по умолчанию — старые значения, чтобы
  // renderCuttingOrder, для которого нет эталона на сверку, не изменился ни
  // на пиксель). renderSpecification передаёт 9.0/10.7, измеренные напрямую
  // по эталону (ПРОМПТ №10.3, pdfplumber: "Спортивный костюм женский
  // (Стеганка)" в ячейке "Товары" — 137.00→146.00 = 9.00pt; отступ после
  // строки "Итого" до "Общая сумма..." — 448.19→458.90=10.71pt).
  overrides: { cellLineHeight?: number; postTableGap?: number; textBaselineDrop?: number; totalRowTextLift?: number } = {},
): void {
  // Высоты строк и размер шрифта измерены напрямую по горизонтальным
  // границам и высоте символов эталона (ПРОМПТ №2.2, pdfplumber): шапка и
  // обычная строка данных — 20pt (строка вмещает две подстроки ячейки
  // "Товары": название модели + цвет), строка "Итого" — 14pt (одна
  // подстрока). Шрифт таблицы — 7.5pt равномерно и в шапке, и в данных (не
  // 9pt, как предполагалось раньше).
  const headerHeight = 20;
  const rowHeight = 20;
  const totalRowHeight = 14;
  const fontSize = 7.5;
  const lineHeight = overrides.cellLineHeight ?? fontSize + 2;

  // Внутренний отступ ячейки — измерен напрямую по эталону (ПРОМПТ №11.4,
  // владелец проекта, 2026-09-19: строка 1 "Товары" в эталоне — "Спортивный
  // костюм женский (Стеганка)" целиком на одной строке, x0=91.29 при левой
  // границе колонки 89.29 (отступ 2.0pt), x1=255.71 при правой границе
  // 259.37 (отступ 3.66pt)). Прежнее значение 3pt с каждой стороны (6pt
  // суммарно) давало ширину переноса 164.1pt — на 0.32pt меньше фактической
  // ширины этой строки шрифтом DejaVu Serif (164.42pt), из-за чего "(Стеганка)"
  // отрывалось на отдельную строку внутри уже принудительно перенесённой
  // ячейки. 2pt с каждой стороны (4pt суммарно, 166.1pt) — ближе к эталону
  // и оставляет запас.
  const CELL_PADDING = 2;

  // Отступ от верхней границы ячейки до базовой линии первой подстроки —
  // приближение ascent шрифта через fontSize (по умолчанию, сохраняет
  // renderCuttingOrder байт-в-байт, для него эталона на сверку нет).
  // renderSpecification передаёт откалиброванное по эталону значение
  // (ПРОМПТ №11.5, владелец проекта, 2026-09-20): растровая сверка после
  // исправления INTRO_TO_TABLE_GAP показала, что "Товары"/шапка таблицы
  // легли на 1.157pt выше измеренного эталона (135.83 вместо 136.99) — не
  // ошибка позиционирования строки, а слишком грубое приближение ascent
  // константой fontSize*0.85. 7.532pt вместо 6.375pt (fontSize*0.85)
  // подобрано так, чтобы разница обнулилась.
  const textBaselineDrop = overrides.textBaselineDrop ?? fontSize * 0.85;
  // Текст ячейки центрируется по вертикали внутри её высоты — и однострочные,
  // и двухстрочные подписи/значения занимают одинаковое видимое положение
  // (эталон: однострочные заголовки "№"/"Товары"/"Размер"/"Кол-во" стоят на
  // той же высоте, что середина двухстрочных "Ед.\nизмер." и т.п.).
  function drawCellLines(
    x: number,
    top: number,
    height: number,
    width: number,
    lines: string[],
    font: PDFFont,
    align: TableColumn["align"],
    isTotalRow = false,
  ): void {
    const blockHeight = lines.length * lineHeight;
    // Строка "Итого" (height=14, а не 20) с тем же textBaselineDrop даёт
    // другую остаточную ошибку, чем обычные строки/шапка (ПРОМПТ №11.5,
    // измерено отдельно: обычные строки нуждались в +1.157pt, "Итого" — в
    // заметно меньшей поправке). totalRowTextLift — измеренная разница,
    // применяется только к строке "Итого" (по умолчанию 0 — не влияет на
    // renderCuttingOrder, где строка "Итого" не откалибрована по эталону).
    const totalRowTextLift = isTotalRow ? (overrides.totalRowTextLift ?? 0) : 0;
    let textY = top - (height - blockHeight) / 2 - textBaselineDrop + totalRowTextLift;
    for (const line of lines) {
      const lineWidth = font.widthOfTextAtSize(line, fontSize);
      const textX =
        align === "center" ? x + (width - lineWidth) / 2 : align === "right" ? x + width - lineWidth - CELL_PADDING : x + CELL_PADDING;
      ctx.page.drawText(line, { x: textX, y: textY, size: fontSize, font, color: rgb(0, 0, 0) });
      textY -= lineHeight;
    }
  }

  const drawHeaderRow = (): void => {
    let x = MARGIN;
    const top = ctx.y;
    for (const column of columns) {
      ctx.page.drawRectangle({ x, y: top - headerHeight, width: column.width, height: headerHeight, borderWidth: 0.75, borderColor: rgb(0, 0, 0) });
      // Заголовок может содержать буквальный перенос строки (эталон:
      // "Ед.\nизмер.", "Цена\n(руб)", "Сумма\n(руб)" набраны в оригинале как
      // два ручных абзаца, не автоперенос по ширине).
      const lines = column.label.split("\n").flatMap((part) => wrapParagraphLines(ctx.boldFont, part, fontSize, column.width - CELL_PADDING * 2));
      drawCellLines(x, top, headerHeight, column.width, lines, ctx.boldFont, column.headerAlign ?? column.align);
      x += column.width;
    }
    ctx.y = top - headerHeight;
  };

  const drawDataRow = (values: Record<string, string>, bold = false, height = rowHeight, isTotalRow = false): void => {
    // Не влезает — новая страница И повтор шапки, иначе продолжение таблицы
    // читается как набор чисел без названий колонок.
    if (ctx.y - height < ctx.bottomMargin) {
      ensureSpace(ctx, height);
      drawHeaderRow();
    }
    let x = MARGIN;
    const top = ctx.y;
    const font = bold ? ctx.boldFont : ctx.font;
    for (const column of columns) {
      ctx.page.drawRectangle({ x, y: top - height, width: column.width, height, borderWidth: 0.75, borderColor: rgb(0, 0, 0) });
      const value = values[column.key] ?? "";
      // Буквальный "\n" в значении — принудительный разрыв строки (эталон:
      // ячейка "Товары" — название модели и цвет ВСЕГДА на отдельных
      // строках, не перенос по ширине запятой между ними — ПРОМПТ №11.4,
      // владелец проекта, 2026-09-19). Автоперенос по ширине применяется
      // только внутри каждой из уже разбитых частей, как и в заголовке.
      const lines = value
        .split("\n")
        .flatMap((part) => wrapParagraphLines(font, part, fontSize, column.width - CELL_PADDING * 2))
        .slice(0, 2);
      drawCellLines(x, top, height, column.width, lines, font, isTotalRow ? (column.totalAlign ?? column.align) : column.align, isTotalRow);
      x += column.width;
    }
    ctx.y = top - height;
  };

  ensureSpace(ctx, headerHeight);
  drawHeaderRow();
  for (const row of rows) drawDataRow(row);
  // Строка "Итого" — одна подстрока, ниже обычной строки данных (эталон:
  // 14pt против 20pt).
  if (totalRow) drawDataRow(totalRow, true, totalRowHeight, true);
  ctx.y -= overrides.postTableGap ?? 12;
}

// Таблица спецификации — тонкая обёртка над обобщённой отрисовкой: форма
// данных спецификации остаётся её собственным знанием.
function drawTable(ctx: DrawContext, template: SpecificationTemplateDefinition, data: SpecificationDocumentData): void {
  drawTableRows(
    ctx,
    template.table.columns,
    data.items.map((item, index) => ({
      index: String(index + 1),
      name: item.name,
      unit: item.unit,
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      sum: item.sum,
    })),
    { name: "Итого", quantity: data.totals.quantity, sum: data.totals.sum },
    // postTableGap: переход "нижняя граница таблицы (вектор) → 'Общая
    // сумма...' (текст 9pt)" — измеренная по эталону дельта глифов 10.71pt
    // не годится напрямую (ПРОМПТ №11.4): она уже включает ascent 9pt-шрифта,
    // а этот параметр прибавляется к базовой линии (той же величине, что и
    // положение векторной границы), поэтому должен быть БОЛЬШЕ на величину
    // ascent — растровая сверка подтвердила итоговое значение.
    // textBaselineDrop/totalRowTextLift — калибровка ПРОМПТ №11.5 (владелец
    // проекта, 2026-09-20), см. комментарии у drawCellLines: значения
    // получены прямым измерением после исправления INTRO_TO_TABLE_GAP (не
    // угаданы) — 7.531959 вместо fontSize*0.85=6.375 (текст шапки/строк
    // данных лёг на измеренную высоту эталона), 0.639648 — отдельная,
    // отдельно измеренная поправка именно для строки "Итого" (высота 14pt,
    // а не 20pt, даёт другую остаточную ошибку той же природы).
    { cellLineHeight: 9.0, postTableGap: 17.6, textBaselineDrop: 7.531959, totalRowTextLift: 0.639648 },
  );
}

export class PdfLibTemplateRenderer implements DocumentRenderAdapter {
  // Раскройное задание: тот же движок, что и спецификация — те же шрифты с
  // кириллицей, та же геометрия, та же отрисовка таблицы. Отличие одно:
  // колонки матрицы строятся по числу цветов партии.
  async renderCuttingOrder(data: CuttingOrderDocumentData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(readFileSync(join(FONTS_DIR, "LiberationSerif-Regular.ttf")), { subset: true });
    const boldFont = await pdfDoc.embedFont(readFileSync(join(FONTS_DIR, "LiberationSerif-Bold.ttf")), { subset: true });

    const ctx: DrawContext = {
      pdfDoc,
      font,
      boldFont,
      page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
      y: PAGE_HEIGHT - MARGIN,
      topMargin: MARGIN,
      bottomMargin: MARGIN,
    };

    drawParagraph(ctx, data.title, { bold: true, size: 13, align: "center", gapAfter: 6 });
    for (const line of data.subtitleLines) {
      drawParagraph(ctx, line, { size: 10, align: "center", gapAfter: 2 });
    }
    ctx.y -= 10;

    const columns: TableColumn[] = buildCuttingOrderColumns(data.colors);
    drawTableRows(
      ctx,
      columns,
      data.rows.map((row) => {
        const values: Record<string, string> = { size: row.size };
        row.quantities.forEach((quantity, index) => {
          values[`c${index}`] = quantity;
        });
        return values;
      }),
      (() => {
        const totals: Record<string, string> = { size: "ИТОГО" };
        data.totals.forEach((total, index) => {
          totals[`c${index}`] = total;
        });
        return totals;
      })(),
    );

    for (const line of data.footerLines) {
      drawParagraph(ctx, line, { size: 10, gapAfter: 4 });
    }

    return pdfDoc.save();
  }

  async renderSpecification(template: SpecificationTemplateDefinition, data: SpecificationDocumentData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(readFileSync(join(FONTS_DIR, "DejaVuSerif-Regular.ttf")), { subset: true });
    const boldFont = await pdfDoc.embedFont(readFileSync(join(FONTS_DIR, "DejaVuSerif-Bold.ttf")), { subset: true });

    // Верхнее/нижнее поле — измерены напрямую по эталону (ПРОМПТ №10.3,
    // владелец проекта, 2026-09-17: "Стоп, текущий PDF не принимаем" — 2
    // страницы вместо 1; read-only анализ по /root/.claude/uploads/.../
    // "Спецификация №7 к Договору № П-22-04" через pdfplumber, тот же файл,
    // что задавал все геометрические измерения ранее). Старое симметричное
    // значение MARGIN=60.94 сверху и снизу не соответствовало эталону:
    // первая строка заголовка там начинается заметно выше (глиф "top"=37pt),
    // последняя строка блока подписи заканчивается заметно ниже (глиф
    // "bottom"=794.56pt из 841.89pt высоты) — с симметричным полем 60.94pt
    // 15-строчная таблица (три цвета × пять размеров — ровно наш случай)
    // не помещалась на одну страницу вместе с пунктами 1-10 и подписями.
    // TOP_MARGIN/BOTTOM_MARGIN ниже — калиброванный по своему же шрифту
    // (Liberation Serif Bold 11pt) эквивалент этих же глифовых границ в
    // терминах базовой линии (baseline), которой оперирует pdf-lib.
    // Пересчитано под DejaVu Serif (владелец проекта, 2026-09-17: переход с
    // Liberation Serif на DejaVu Serif — реальный шрифт эталона — обнажил
    // три пункта условий (5, 7, 10), которые в эталоне физически переносятся
    // на 2 строки, но с более узкой Liberation Serif умещались в одну — само
    // по себе расхождение с эталоном, не новая проблема; DejaVu Serif это
    // расхождение устранило, но потребовало более точных полей: первая
    // строка заголовка должна начинаться на измеренной высоте (top=37.00pt)
    // без запаса "на всякий случай" — величина запаса и стала причиной
    // переполнения при 3 дополнительных строках.
    // Откалибровано напрямую по растровому сравнению (ПРОМПТ №11.4, владелец
    // проекта, 2026-09-19): при TOP_MARGIN=40.0 первая строка заголовка
    // ложилась на glyph-top=31.60pt против измеренных в эталоне 37.00pt —
    // разница ровно 5.4pt, постоянная по всему документу (не накапливается:
    // тот же сдвиг подтверждён на пункте 10 и на "Исполнитель:"), то есть
    // причина — исключительно исходная точка (TOP_MARGIN), не lineHeight и
    // не масштаб. +5.4pt возвращает первую строку на измеренную высоту.
    const TOP_MARGIN = 45.4;
    const BOTTOM_MARGIN = 40.0;
    const ctx: DrawContext = {
      pdfDoc,
      font,
      boldFont,
      page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
      y: PAGE_HEIGHT - TOP_MARGIN,
      topMargin: TOP_MARGIN,
      bottomMargin: BOTTOM_MARGIN,
    };

    // Заголовок — три центрированные строки (ПРОМПТ №2.2, фактическая
    // сверка, уточнено ПРОМПТ №10.3): только первая строка (номер+дата
    // спецификации) жирная и крупнее (11pt), строки 2-3 (договор, стороны) —
    // обычным весом, 10pt.
    // ПРОМПТ №11.5 (владелец проекта, 2026-09-20): дельты "top" между
    // строками заголовка (13.70/12.00) — это СЫРЫЕ глиф-координаты эталона,
    // а не готовые decrement-значения. Переход L2→L3 (10pt→10pt, тот же
    // размер и начертание) корректно использует дельту напрямую (ascent
    // одинаковый, сокращается) — так и было, 12.0 остаётся без изменений.
    // Переход L1→L2 (11pt Bold→10pt Regular) пересекает и размер, и
    // начертание одновременно — прямое использование дельты 13.70 без
    // поправки на разницу ascent между 11pt Bold и 10pt Regular давало
    // постоянную +0.80pt ошибку, которая тянулась через ВСЮ обложку (строки
    // 2-3 заголовка) и была скрыта только потому, что TITLE_TO_INTRO_GAP
    // ниже, откалиброванный позже (ПРОМПТ №11.4) методом "подогнать под
    // пункт 1", случайно компенсировал именно эту ошибку — но visible-баг
    // оставался на самих строках 2-3 заголовка (растровая сверка ПРОМПТ
    // №11.5: top=51.50/63.50 вместо измеренных в эталоне 50.70/62.70).
    // -0.10 вместо 0.7 — уменьшает decrement L1→L2 на 0.80pt (13.0-0.10=12.90
    // вместо 13.0+0.7=13.70), возвращая строки 2-3 на измеренную высоту.
    const TITLE_LINE_HEIGHTS = [13.0, 12.0, 12.0];
    const TITLE_GAP_AFTER = [-0.1, 0, 0];
    // Было 9.59 — калибровка ПРОМПТ №11.4 непреднамеренно вобрала в себя
    // компенсацию бага TITLE_GAP_AFTER[0] выше (см. комментарий там). После
    // исправления этого бага decrement L1→L2 стал на 0.80pt МЕНЬШЕ, поэтому
    // TITLE_TO_INTRO_GAP увеличен на те же 0.80pt (9.59→10.39), чтобы пункт 1
    // остался на той же измеренной высоте (top=85.80pt), как и было.
    const TITLE_TO_INTRO_GAP = 10.39;
    template.titleLines.forEach((line, index) => {
      const isFirstLine = index === 0;
      drawParagraph(ctx, applyPlaceholders(line, data.fields), {
        bold: isFirstLine,
        size: isFirstLine ? 11 : 10,
        align: "center",
        lineHeight: TITLE_LINE_HEIGHTS[index],
        gapAfter: TITLE_GAP_AFTER[index],
      });
    });
    ctx.y -= TITLE_TO_INTRO_GAP;
    // justify: true — эталон растягивает межсловные пробелы во вводном
    // пункте и в пунктах 2-10 так, что все строки, кроме последней в каждом
    // абзаце, доходят до правого края (см. drawJustifiedLine). Размер 9pt и
    // lineHeight 11.0pt — измерены напрямую по эталону (не 10.5pt по
    // умолчанию); тот же lineHeight используется во всех абзацах ниже
    // (totalSumLine, пункты 2-10) — эталон держит единый интервал для всего
    // текста, набранного 9pt.
    const BODY_LINE_HEIGHT = 11.0;
    // Левая граница и ширина строки для пунктов 1-10 и "Общая сумма..." — НЕ
    // MARGIN/CONTENT_WIDTH (эти константы верны для таблицы и центрирования
    // заголовка, но не для обычного текста пунктов). ПРОМПТ №11.6, владелец
    // проекта, 2026-09-20: посимвольное сравнение X-координат первого слова
    // на 12+ независимых строках эталона (пункт 1, "Общая сумма", пункты
    // 2-10, и justify-, и не-justify-строки одинаково) показало x0=62.69pt
    // (не 60.94pt=MARGIN) и правый край justify-строк x1=532.58pt — то есть
    // симметричная рамка на 1.75pt уже с каждой стороны (469.89pt против
    // 473.4pt). Раньше не замечено: вертикальная сверка (ПРОМПТ №11.4-11.5)
    // не проверяла X. Не влияет на центрированный заголовок (симметричное
    // сужение не сдвигает середину) и не влияет на renderCuttingOrder
    // (BODY_TEXT_LEFT/WIDTH передаются только явно, см. вызовы ниже).
    const BODY_TEXT_LEFT = 62.69;
    const BODY_TEXT_WIDTH = 469.89;
    // Отступ после абзаца — единый для "Общая сумма..." и каждого пункта
    // условий (ПРОМПТ №10.3: измерен на 9 независимых переходах МЕЖДУ
    // ПУНКТАМИ эталона, то есть между текстом одного и того же размера
    // (9pt) — везде 5.5-5.7pt, принято 5.6pt). НЕ используется для перехода
    // "пункт 1 → таблица" ниже — та граница текст(9pt)→вектор (верхняя
    // линия таблицы) и требует своей отдельной константы, ascent сюда не
    // сокращается симметрично (см. INTRO_TO_TABLE_GAP).
    // Уточнено ПРОМПТ №11.5 (владелец проекта, 2026-09-20): 5.6 было средним
    // по 9 переходам by eye, с остаточной ошибкой ~0.05pt за переход — по
    // отдельности неразличимо (округление до 0.1pt), но накопленная сумма
    // по всем 11 применениям gapAfter:PARAGRAPH_GAP от "Общая сумма..." до
    // "Исполнитель:" (п2a→п2b→п3→п4→п5→п6→п7→п8→п9→п10→подписи) даёт чёткий
    // измеренный дрейф −0.60pt (растровая сверка). 5.6+0.60/11=5.6545 —
    // распределяет всю измеренную поправку равномерно по всем переходам.
    const PARAGRAPH_GAP = 5.6545;
    // Откалибровано так же, как TITLE_TO_INTRO_GAP выше: раньше это была
    // PARAGRAPH_GAP (5.6), но переход "текст → верхняя граница таблицы"
    // (вектор) — другая величина, не совпадающая с переходами "текст →
    // текст" между пунктами (ПРОМПТ №11.4). Подобрано так, чтобы верхняя
    // граница таблицы легла ровно на измеренную высоту эталона (114.19pt).
    // Было 0.3 (ПРОМПТ №11.4) — растровая сверка ПРОМПТ №11.5 показала
    // верхнюю границу таблицы на 114.99pt вместо 114.19pt (независимая от
    // заголовка ошибка ровно +0.80pt, не связанная с TITLE_TO_INTRO_GAP:
    // пункт 1 сам по себе положением не сдвигался). -0.5 вместо 0.3
    // уменьшает decrement ровно на те же 0.80pt.
    const INTRO_TO_TABLE_GAP = -0.5;
    drawParagraph(ctx, applyPlaceholders(template.introParagraph, data.fields), {
      size: 9,
      justify: true,
      lineHeight: BODY_LINE_HEIGHT,
      gapAfter: INTRO_TO_TABLE_GAP,
      leftMargin: BODY_TEXT_LEFT,
      contentWidth: BODY_TEXT_WIDTH,
    });

    drawTable(ctx, template, data);

    // Строка "Общая сумма Спецификации №N составляет: X руб." — под таблицей,
    // до пунктов условий (ПРОМПТ №2.2, обнаружена в эталоне).
    drawParagraph(ctx, applyPlaceholders(template.totalSumLine, data.fields), {
      size: 9,
      lineHeight: BODY_LINE_HEIGHT,
      gapAfter: PARAGRAPH_GAP,
      leftMargin: BODY_TEXT_LEFT,
      contentWidth: BODY_TEXT_WIDTH,
    });

    for (const line of template.footerLines) {
      drawParagraph(ctx, applyPlaceholders(line, data.fields), {
        size: 9,
        justify: true,
        lineHeight: BODY_LINE_HEIGHT,
        gapAfter: PARAGRAPH_GAP,
        leftMargin: BODY_TEXT_LEFT,
        contentWidth: BODY_TEXT_WIDTH,
      });
    }
    // Отступ до блока подписей — сверх обычного PARAGRAPH_GAP, которым уже
    // завершился пункт 10 (эталон: от последней строки пункта 10 до
    // "Исполнитель:" — 29.10pt = 11.0(lineHeight) + 5.6(PARAGRAPH_GAP уже
    // применён последним abзацем цикла выше) + 12.5 добавочных).
    ctx.y -= 12.5;

    // Подписи без печатей — только места под подпись (требование владельца
    // проекта 2026-07-26: "без печатей, без подписей, места под подписи
    // оставить"). Заголовок → название стороны → пустое место под реквизиты →
    // должность (если есть) → строка для росписи ВПЛОТНУЮ ПЕРЕД расшифровкой
    // подписи (ФИО), на одной строке с ней → "М.П." — официальный формат
    // ("_________________ Фамилия И.О."), поправлено 2026-07-27: линия должна
    // стоять напротив фамилии, а не отдельной строкой над всем блоком.
    //
    // Левый и правый блок могут иметь разное число строк до подписи (у
    // Исполнителя — "должность" + ФИО, у Заказчика-ИП — только ФИО). Чтобы обе
    // строки для росписи и "М.П." оказались строго на одной горизонтали
    // (владелец проекта, 2026-07-27: "должно быть всё ровно, как под
    // линейку"), более короткий блок дополняется пустыми строками СВЕРХУ —
    // строка подписи всегда последняя и всегда на одной и той же высоте.
    ensureSpace(ctx, 54);
    const columnWidth = CONTENT_WIDTH / 2;
    const signatureTop = ctx.y;
    // Место для росписи от руки после ФИО — в эталоне это НЕ отдельная
    // векторная линия, а буквальные символы "_" (ПРОМПТ №11.5, владелец
    // проекта, 2026-09-20: посимвольное извлечение эталона — pdfplumber
    // page.chars — показало ровно 24 символа "_" сразу после ФИО, БЕЗ
    // отступа, на той же базовой линии, что и сам текст: "Нормуродов
    // О.А.________________________" — единая строка одним шрифтом. Прежняя
    // реализация (drawLine, 90pt, 6pt отступ) вставляла отдельную векторную
    // линию на 3.88pt ниже базовой линии текста — заметное расхождение на
    // overlay в блоке подписей). SIGNATURE_LINE — 24 символа "_", без пробела.
    const SIGNATURE_LINE = "_".repeat(24);
    // Единая высота строки блока подписи (header→компания, подписант→М.П.) —
    // измерена напрямую по эталону (ПРОМПТ №10.3, pdfplumber: "Исполнитель:"
    // top=731.60 → компания top=744.60 = 13.00pt; строка с ФИО→"М.П."=13.00pt).
    // Было 15pt — эталон заметно компактнее.
    const nameLineHeight = 13.0;
    // Отступ от названия стороны до первой из "подписных" строк (роль/пусто →
    // ФИО+линия) — эталон: компания top=744.60 → "Генеральный директор"
    // top=759.60 = 15.00pt. Было 34pt под "пустые реквизиты" — в эталоне
    // никакого отдельного пустого блока под реквизиты нет вовсе.
    const signatureLeadGap = 15.0;
    // Отступ перед самой строкой росписи (между "должностью" и строкой с ФИО
    // и линией) — эталон: "Генеральный директор" top=759.60 → строка с ФИО
    // top=772.60 = 13.00pt (было 32pt, эталон вдвое плотнее).
    const signatureRowGap = 13.0;
    // Размеры и начертания сверены напрямую с эталоном (ПРОМПТ №2.2): "Исполнитель:"/
    // "Заказчик:" и название стороны — жирным, 9pt; должность/ФИО подписанта —
    // обычным весом, 9pt (было 10.5/10, не жирная companyLine).
    const nameRowCount = Math.max(template.signatures.left.nameLines.length, template.signatures.right.nameLines.length);
    // Левая колонка блока подписей в эталоне начинается на 4.25pt ЛЕВЕЕ
    // обычного поля страницы (ПРОМПТ №11.5, владелец проекта, 2026-09-20:
    // pdfplumber — "Исполнитель:"/"ОсОО"/"Генеральный"/"Нормуродов"/"М.П."
    // все на x0=56.69, тогда как MARGIN=60.94; правая колонка при этом
    // измерена ровно на MARGIN+columnWidth=297.64 — совпадает без поправок).
    // Асимметрия — свойство самого эталона (документ так свёрстан), не
    // ошибка измерения: сверено на всех 5 строках левой колонки.
    const SIGNATURE_COLUMN_X = [MARGIN - 4.25, MARGIN + columnWidth];
    for (const [index, block] of [template.signatures.left, template.signatures.right].entries()) {
      const x = SIGNATURE_COLUMN_X[index];
      let lineY = signatureTop;
      ctx.page.drawText(block.headerLine, { x, y: lineY, size: 9, font: boldFont, color: rgb(0, 0, 0) });
      lineY -= nameLineHeight;
      ctx.page.drawText(applyPlaceholders(block.companyLine, data.fields), { x, y: lineY, size: 9, font: boldFont, color: rgb(0, 0, 0) });
      lineY -= signatureLeadGap;

      const padding = nameRowCount - block.nameLines.length;
      const paddedNameLines = [...Array<string>(padding).fill(""), ...block.nameLines];
      paddedNameLines.forEach((line, lineIndex) => {
        const text = applyPlaceholders(line, data.fields);
        const isSignerNameLine = lineIndex === paddedNameLines.length - 1;
        const isRowBeforeSigner = lineIndex === paddedNameLines.length - 2;
        if (isSignerNameLine) {
          // Порядок «ФИО → линия» (ПРОМПТ №2.2, фактическая сверка: в
          // эталоне напечатанное ФИО стоит ПЕРЕД местом для росписи, не
          // после) — было наоборот. Линия — часть той же строки текста
          // (SIGNATURE_LINE, см. выше), не отдельный графический примитив.
          ctx.page.drawText(text + SIGNATURE_LINE, { x, y: lineY, size: 9, font, color: rgb(0, 0, 0) });
        } else if (text) {
          ctx.page.drawText(text, { x, y: lineY, size: 9, font, color: rgb(0, 0, 0) });
        }
        lineY -= isRowBeforeSigner ? signatureRowGap : nameLineHeight;
      });
      ctx.page.drawText(block.stampLabel, { x, y: lineY, size: 9, font, color: rgb(0, 0, 0) });
    }

    return pdfDoc.save();
  }
}
