import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import type { DocumentRenderAdapter, SpecificationPdfData } from "../application/ports";

// pdf-lib — программная раскладка без headless-браузера (docs/TECH_STACK.md,
// раздел "Document Engine — генерация PDF"). Один жёсткий шаблон на старте
// (docs/DOCUMENT_ENGINE_ARCHITECTURE.md, раздел 2) — брендированные шаблоны
// на компанию добавляются, когда появится реальная потребность, не заранее.
//
// Стандартные 14 PDF-шрифтов (Helvetica и т.п.) кодируются только WinAnsi —
// не умеют кириллицу вообще (проверено вручную: PDFPage.drawText бросает
// "WinAnsiCannotEncode" на любой русской букве). Для документа на русском
// языке нужен встроенный TTF-шрифт с поддержкой кириллицы — DejaVu Sans
// (лицензия Bitstream Vera, свободное распространение), файлы шрифта лежат
// в assets/fonts/ этого пакета, не полагаются на шрифты, установленные в ОС
// (cloud-agnostic — тот же результат на любой из целевых площадок,
// docs/INFRASTRUCTURE.md).
const FONTS_DIR = join(__dirname, "..", "..", "assets", "fonts");

export class PdfLibSpecificationRenderer implements DocumentRenderAdapter {
  async renderSpecification(data: SpecificationPdfData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const regularBytes = readFileSync(join(FONTS_DIR, "DejaVuSans.ttf"));
    const boldBytes = readFileSync(join(FONTS_DIR, "DejaVuSans-Bold.ttf"));
    const font = await pdfDoc.embedFont(regularBytes, { subset: true });
    const boldFont = await pdfDoc.embedFont(boldBytes, { subset: true });

    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const margin = 50;
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const drawLine = (text: string, options: { bold?: boolean; size?: number; gap?: number } = {}): void => {
      const size = options.size ?? 11;
      const gap = options.gap ?? size + 6;
      if (y < margin + gap) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(text, { x: margin, y, size, font: options.bold ? boldFont : font, color: rgb(0, 0, 0) });
      y -= gap;
    };

    drawLine("Спецификация на пошив", { bold: true, size: 18, gap: 28 });
    drawLine(`Модель: ${data.productName}`, { bold: true, size: 13 });
    drawLine(`Цех: ${data.workshopName}`);
    if (data.dueDate) drawLine(`Срок готовности: ${data.dueDate}`);
    y -= 10;

    drawLine("Разбивка по размерам и цветам:", { bold: true, gap: 20 });
    for (const variant of data.variants) {
      drawLine(`  ${variant.color}, размер ${variant.size} — ${variant.quantity} шт.`);
    }
    y -= 10;

    drawLine("Расход материалов:", { bold: true, gap: 20 });
    for (const material of data.materials) {
      drawLine(`  ${material.materialName} — ${material.totalQuantity} ${material.unit}`);
    }

    return pdfDoc.save();
  }
}
