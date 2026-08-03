import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import { applyPlaceholders, type SpecificationDocumentData, type SpecificationTemplateDefinition } from "../domain/specification-template";
import type { DocumentRenderAdapter } from "../application/ports";

// pdf-lib — программная раскладка без headless-браузера (docs/TECH_STACK.md,
// раздел "Document Engine — генерация PDF"). Document Template Engine
// (docs/DOCUMENT_ENGINE_ARCHITECTURE.md, раздел 2, расширено 2026-07-26) —
// этот рендерер не хардкодит ни один документ: он раскладывает переданную
// SpecificationTemplateDefinition (структура) + SpecificationDocumentData
// (значения) в PDF. Разные шаблоны для разных цехов/компаний — то же самое
// вызывает этот же рендерер с другим объектом-шаблоном.
//
// Стандартные 14 PDF-шрифтов не умеют кириллицу (проверено вручную —
// см. git-историю) — Liberation Serif встроен из assets/fonts/, не зависит от
// шрифтов, установленных в ОС (cloud-agnostic, docs/INFRASTRUCTURE.md).
// Liberation Serif — метрически совместим с Times New Roman и содержит
// кириллицу (SIL Open Font License 1.1, свободно распространяется) — тот же
// шрифт, что и в эталонном образце документа (2026-07-26).
const FONTS_DIR = join(__dirname, "..", "..", "assets", "fonts");
// Размер страницы измерен напрямую по эталонному документу (владелец
// проекта, 2026-08-03, спецификация №1 к договору №П-22-04) — 612×842pt,
// не стандартный A4 (595.28×841.89): подтверждено PDF MediaBox эталона.
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 842;
const MARGIN = 45;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

interface DrawContext {
  pdfDoc: PDFDocument;
  font: PDFFont;
  boldFont: PDFFont;
  page: PDFPage;
  y: number;
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
  if (ctx.y - needed < MARGIN) {
    ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.y = PAGE_HEIGHT - MARGIN;
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
  options: { bold?: boolean; size?: number; align?: "left" | "right" | "center"; justify?: boolean; gapAfter?: number } = {},
): void {
  const size = options.size ?? 10.5;
  const font = options.bold ? ctx.boldFont : ctx.font;
  // Межстрочный интервал в основном тексте измерен по эталону (владелец
  // проекта, 2026-08-03) — около 12pt для 10.5pt текста (было +4pt, что
  // визуально заметно просторнее оригинала).
  const lineHeight = size + 1.5;

  for (const paragraph of text.split("\n")) {
    const lines = wrapParagraphLines(font, paragraph, size, CONTENT_WIDTH);
    lines.forEach((line, index) => {
      ensureSpace(ctx, lineHeight);
      const isLastLineOfParagraph = index === lines.length - 1;
      if (options.justify && !isLastLineOfParagraph && !options.align) {
        drawJustifiedLine(ctx, line, font, size, MARGIN, CONTENT_WIDTH);
      } else {
        const width = font.widthOfTextAtSize(line, size);
        const x =
          options.align === "center"
            ? MARGIN + (CONTENT_WIDTH - width) / 2
            : options.align === "right"
              ? MARGIN + CONTENT_WIDTH - width
              : MARGIN;
        ctx.page.drawText(line, { x, y: ctx.y, size, font, color: rgb(0, 0, 0) });
      }
      ctx.y -= lineHeight;
    });
  }
  ctx.y -= options.gapAfter ?? 4;
}

function drawTable(ctx: DrawContext, template: SpecificationTemplateDefinition, data: SpecificationDocumentData): void {
  const { columns } = template.table;
  // Высоты строк измерены по эталону автоматическим детектированием
  // горизонтальных границ (владелец проекта, 2026-08-03, вторая проверка):
  // ряд данных ~15pt (подтверждено), шапка ~25.2pt (не 22pt — двухстрочные
  // заголовки "Ед.\nизмер." и т.д. не помещаются в 22pt).
  const headerHeight = 25;
  const rowHeight = 15;
  const fontSize = 9;

  const drawHeaderRow = (): void => {
    ensureSpace(ctx, headerHeight);
    let x = MARGIN;
    const top = ctx.y;
    for (const column of columns) {
      ctx.page.drawRectangle({ x, y: top - headerHeight, width: column.width, height: headerHeight, borderWidth: 0.75, borderColor: rgb(0, 0, 0) });
      // Заголовок может содержать буквальный перенос строки (эталон
      // 2026-08-03: "Ед.\nизмер.", "Цена\n(руб)", "Сумма\n(руб)" набраны в
      // оригинале как два ручных абзаца, не автоперенос по ширине).
      const lines = column.label.split("\n").flatMap((part) => wrapParagraphLines(ctx.boldFont, part, fontSize, column.width - 6));
      let textY = top - 9;
      for (const line of lines) {
        const width = ctx.boldFont.widthOfTextAtSize(line, fontSize);
        const textX = column.align === "center" ? x + (column.width - width) / 2 : column.align === "right" ? x + column.width - width - 3 : x + 3;
        ctx.page.drawText(line, { x: textX, y: textY, size: fontSize, font: ctx.boldFont, color: rgb(0, 0, 0) });
        textY -= fontSize + 2;
      }
      x += column.width;
    }
    ctx.y = top - headerHeight;
  };

  const drawDataRow = (values: Record<string, string>, bold = false): void => {
    ensureSpace(ctx, rowHeight);
    let x = MARGIN;
    const top = ctx.y;
    const font = bold ? ctx.boldFont : ctx.font;
    for (const column of columns) {
      ctx.page.drawRectangle({ x, y: top - rowHeight, width: column.width, height: rowHeight, borderWidth: 0.75, borderColor: rgb(0, 0, 0) });
      const value = values[column.key] ?? "";
      const lines = wrapParagraphLines(font, value, fontSize, column.width - 6);
      let textY = top - 10;
      for (const line of lines.slice(0, 2)) {
        const width = font.widthOfTextAtSize(line, fontSize);
        const textX = column.align === "center" ? x + (column.width - width) / 2 : column.align === "right" ? x + column.width - width - 3 : x + 3;
        ctx.page.drawText(line, { x: textX, y: textY, size: fontSize, font, color: rgb(0, 0, 0) });
        textY -= fontSize + 2;
      }
      x += column.width;
    }
    ctx.y = top - rowHeight;
  };

  drawHeaderRow();
  data.items.forEach((item, index) => {
    drawDataRow({
      index: String(index + 1),
      name: item.name,
      unit: item.unit,
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      sum: item.sum,
    });
  });
  drawDataRow({ name: "Итого", quantity: data.totals.quantity, sum: data.totals.sum }, true);
  ctx.y -= 12;
}

export class PdfLibTemplateRenderer implements DocumentRenderAdapter {
  async renderSpecification(template: SpecificationTemplateDefinition, data: SpecificationDocumentData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(readFileSync(join(FONTS_DIR, "LiberationSerif-Regular.ttf")), { subset: true });
    const boldFont = await pdfDoc.embedFont(readFileSync(join(FONTS_DIR, "LiberationSerif-Bold.ttf")), { subset: true });

    const ctx: DrawContext = { pdfDoc, font, boldFont, page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN };

    // Заголовок — три центрированные строки жирным (эталон 2026-07-26), без
    // отдельного правого блока реквизитов сверху.
    for (const line of template.titleLines) {
      drawParagraph(ctx, applyPlaceholders(line, data.fields), { bold: true, size: 12, align: "center", gapAfter: 2 });
    }
    ctx.y -= 4;
    // justify: true — эталон растягивает межсловные пробелы во вводном
    // пункте и в пунктах 2-6 так, что все строки, кроме последней в каждом
    // абзаце, доходят до правого края (см. drawJustifiedLine).
    drawParagraph(ctx, applyPlaceholders(template.introParagraph, data.fields), { justify: true, gapAfter: 16 });

    drawTable(ctx, template, data);

    for (const line of template.footerLines) {
      drawParagraph(ctx, applyPlaceholders(line, data.fields), { justify: true, gapAfter: 6 });
    }
    ctx.y -= 20;

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
    ensureSpace(ctx, 110);
    const columnWidth = CONTENT_WIDTH / 2;
    const signatureTop = ctx.y;
    const signatureLineWidth = 90; // pt — место для росписи от руки перед ФИО
    const signatureLineGap = 6; // pt — отступ между линией и напечатанным ФИО
    const nameLineHeight = 15; // pt — единая высота строки во всём блоке подписи
    // Отступ перед самой строкой росписи (между "должностью" и линией для
    // подписи) сделан больше обычной высоты строки — иначе от руки просто
    // негде расписаться (владелец проекта, 2026-07-27: "ширина между ними
    // должна быть больше, чтобы было место под роспись").
    const signatureRowGap = 32;
    const nameRowCount = Math.max(template.signatures.left.nameLines.length, template.signatures.right.nameLines.length);
    for (const [index, block] of [template.signatures.left, template.signatures.right].entries()) {
      const x = MARGIN + index * columnWidth;
      let lineY = signatureTop;
      ctx.page.drawText(block.headerLine, { x, y: lineY, size: 10.5, font: boldFont, color: rgb(0, 0, 0) });
      lineY -= nameLineHeight;
      ctx.page.drawText(applyPlaceholders(block.companyLine, data.fields), { x, y: lineY, size: 10, font, color: rgb(0, 0, 0) });
      lineY -= 34; // пустое место под реквизиты стороны

      const padding = nameRowCount - block.nameLines.length;
      const paddedNameLines = [...Array<string>(padding).fill(""), ...block.nameLines];
      paddedNameLines.forEach((line, lineIndex) => {
        const text = applyPlaceholders(line, data.fields);
        const isSignerNameLine = lineIndex === paddedNameLines.length - 1;
        const isRowBeforeSigner = lineIndex === paddedNameLines.length - 2;
        if (isSignerNameLine) {
          ctx.page.drawLine({
            start: { x, y: lineY + 3 },
            end: { x: x + signatureLineWidth, y: lineY + 3 },
            thickness: 0.75,
            color: rgb(0, 0, 0),
          });
          ctx.page.drawText(text, { x: x + signatureLineWidth + signatureLineGap, y: lineY, size: 10, font, color: rgb(0, 0, 0) });
        } else if (text) {
          ctx.page.drawText(text, { x, y: lineY, size: 10, font, color: rgb(0, 0, 0) });
        }
        lineY -= isRowBeforeSigner ? signatureRowGap : nameLineHeight;
      });
      ctx.page.drawText(block.stampLabel, { x, y: lineY, size: 10, font, color: rgb(0, 0, 0) });
    }

    return pdfDoc.save();
  }
}
