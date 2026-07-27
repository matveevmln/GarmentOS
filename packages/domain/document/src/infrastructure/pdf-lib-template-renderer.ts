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
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 45;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

interface DrawContext {
  pdfDoc: PDFDocument;
  font: PDFFont;
  boldFont: PDFFont;
  page: PDFPage;
  y: number;
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ");
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
  }
  return lines;
}

function ensureSpace(ctx: DrawContext, needed: number): void {
  if (ctx.y - needed < MARGIN) {
    ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.y = PAGE_HEIGHT - MARGIN;
  }
}

function drawParagraph(ctx: DrawContext, text: string, options: { bold?: boolean; size?: number; align?: "left" | "right" | "center"; gapAfter?: number } = {}): void {
  const size = options.size ?? 10.5;
  const font = options.bold ? ctx.boldFont : ctx.font;
  const lineHeight = size + 4;
  const lines = wrapText(font, text, size, CONTENT_WIDTH);

  for (const line of lines) {
    ensureSpace(ctx, lineHeight);
    const width = font.widthOfTextAtSize(line, size);
    const x = options.align === "center" ? MARGIN + (CONTENT_WIDTH - width) / 2 : options.align === "right" ? MARGIN + CONTENT_WIDTH - width : MARGIN;
    ctx.page.drawText(line, { x, y: ctx.y, size, font, color: rgb(0, 0, 0) });
    ctx.y -= lineHeight;
  }
  ctx.y -= options.gapAfter ?? 4;
}

function drawTable(ctx: DrawContext, template: SpecificationTemplateDefinition, data: SpecificationDocumentData): void {
  const { columns } = template.table;
  const headerHeight = 26;
  const rowHeight = 24;
  const fontSize = 9;

  const drawHeaderRow = (): void => {
    ensureSpace(ctx, headerHeight);
    let x = MARGIN;
    const top = ctx.y;
    for (const column of columns) {
      ctx.page.drawRectangle({ x, y: top - headerHeight, width: column.width, height: headerHeight, borderWidth: 0.75, borderColor: rgb(0, 0, 0) });
      const lines = wrapText(ctx.boldFont, column.label, fontSize, column.width - 6);
      let textY = top - 12;
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
      const lines = wrapText(font, value, fontSize, column.width - 6);
      let textY = top - 12;
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
    ctx.y -= 10;
    drawParagraph(ctx, applyPlaceholders(template.introParagraph, data.fields), { gapAfter: 16 });

    drawTable(ctx, template, data);

    for (const line of template.footerLines) {
      drawParagraph(ctx, applyPlaceholders(line, data.fields), { gapAfter: 6 });
    }
    ctx.y -= 20;

    // Подписи без печатей — только места под подпись (требование владельца
    // проекта 2026-07-26: "без печатей, без подписей, места под подписи
    // оставить"). Заголовок → название стороны → пустое место под реквизиты →
    // должность (если есть) → строка для росписи ВПЛОТНУЮ ПЕРЕД расшифровкой
    // подписи (ФИО), на одной строке с ней → "М.П." — официальный формат
    // ("_________________ Фамилия И.О."), поправлено 2026-07-27: линия должна
    // стоять напротив фамилии, а не отдельной строкой над всем блоком.
    ensureSpace(ctx, 110);
    const columnWidth = CONTENT_WIDTH / 2;
    const signatureTop = ctx.y;
    const signatureLineWidth = 90; // pt — место для росписи от руки перед ФИО
    const signatureLineGap = 6; // pt — отступ между линией и напечатанным ФИО
    for (const [index, block] of [template.signatures.left, template.signatures.right].entries()) {
      const x = MARGIN + index * columnWidth;
      let lineY = signatureTop;
      ctx.page.drawText(block.headerLine, { x, y: lineY, size: 10.5, font: boldFont, color: rgb(0, 0, 0) });
      lineY -= 15;
      ctx.page.drawText(applyPlaceholders(block.companyLine, data.fields), { x, y: lineY, size: 10, font, color: rgb(0, 0, 0) });
      lineY -= 34; // пустое место под реквизиты стороны

      block.nameLines.forEach((line, lineIndex) => {
        const text = applyPlaceholders(line, data.fields);
        const isSignerNameLine = lineIndex === block.nameLines.length - 1;
        if (isSignerNameLine) {
          ctx.page.drawLine({
            start: { x, y: lineY + 3 },
            end: { x: x + signatureLineWidth, y: lineY + 3 },
            thickness: 0.75,
            color: rgb(0, 0, 0),
          });
          ctx.page.drawText(text, { x: x + signatureLineWidth + signatureLineGap, y: lineY, size: 10, font, color: rgb(0, 0, 0) });
        } else {
          ctx.page.drawText(text, { x, y: lineY, size: 10, font, color: rgb(0, 0, 0) });
        }
        lineY -= 15;
      });
      ctx.page.drawText(block.stampLabel, { x, y: lineY, size: 10, font, color: rgb(0, 0, 0) });
    }

    return pdfDoc.save();
  }
}
