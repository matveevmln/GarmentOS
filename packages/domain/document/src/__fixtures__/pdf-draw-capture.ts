import { PDFDict, PDFDocument, PDFName, PDFPage } from "pdf-lib";
import { PdfLibTemplateRenderer } from "../infrastructure/pdf-lib-template-renderer";
import type { SpecificationDocumentData, SpecificationTemplateDefinition } from "../domain/specification-template";

// Инструментирование рендера ради PDF-regression теста (владелец проекта,
// 2026-09-22). Вместо повторного парсинга сгенерированного PDF сторонней
// библиотекой (в проекте нет ни одной для этого — только pdf-lib, писатель,
// не парсер общего назначения) перехватываем PDFPage.prototype.drawText на
// время одного вызова рендерера: рендерер (pdf-lib-template-renderer.ts) сам
// не изменяется, каждый вызов text/x/y/size уже и есть "текстовый слой с
// координатами", снятый в точке истины, а не восстановленный из байтов PDF
// сторонним парсером со своими округлениями. Патч снимается сразу после
// рендера, даже если рендер бросил ошибку.
export interface CapturedDrawCall {
  text: string;
  x: number;
  y: number;
  size: number;
  pageIndex: number;
}

export interface CapturedSpecificationRender {
  pdfBytes: Uint8Array;
  calls: CapturedDrawCall[];
}

export async function captureSpecificationRender(
  template: SpecificationTemplateDefinition,
  data: SpecificationDocumentData,
): Promise<CapturedSpecificationRender> {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- всегда вызывается через original.call(this, ...) ниже, unbound this не риск.
  const original = PDFPage.prototype.drawText;
  // Индекс страницы назначается ЖИВЬЁМ, по порядку первого появления
  // PDFPage-объекта в потоке вызовов drawText — рендерер добавляет страницы
  // строго по возрастанию (ensureSpace вызывает pdfDoc.addPage и один раз
  // переключает ctx.page, назад не возвращается), поэтому Map<PDFPage, number>
  // корректно восстанавливает номер страницы без обращения к самому
  // PDFPage (в нём это не хранится). Раньше индекс пытались получить постфактум
  // через `(await PDFDocument.load(pdfBytes)).getPages().indexOf(page)` — это
  // ВСЕГДА возвращало -1: load() из уже сохранённых байт создаёт новые
  // PDFPage-инстансы, объектно не равные тем, что использовались во время
  // рендера (баг обнаружен и исправлен во время написания этого теста —
  // baseline ниже уже сгенерирован верной версией).
  const pageIndexByInstance = new Map<PDFPage, number>();
  const rawCalls: Array<{ text: string; x: number; y: number; size: number; pageIndex: number }> = [];
  PDFPage.prototype.drawText = function patchedDrawText(
    this: PDFPage,
    text: string,
    options?: { x?: number; y?: number; size?: number },
  ) {
    let pageIndex = pageIndexByInstance.get(this);
    if (pageIndex === undefined) {
      pageIndex = pageIndexByInstance.size;
      pageIndexByInstance.set(this, pageIndex);
    }
    rawCalls.push({ text, x: options?.x ?? 0, y: options?.y ?? 0, size: options?.size ?? 0, pageIndex });
    return original.call(this, text, options);
  };

  let pdfBytes: Uint8Array;
  try {
    const renderer = new PdfLibTemplateRenderer();
    pdfBytes = await renderer.renderSpecification(template, data);
  } finally {
    PDFPage.prototype.drawText = original;
  }

  return { pdfBytes, calls: rawCalls };
}

// Базовое имя встроенного шрифта без служебного суффикса, который pdf-lib
// добавляет при { subset: true } (например "DejaVuSerif-5463" вместо
// "DejaVuSerif") — калибровка (ПРОМПТ №10.3) фиксирует именно семейство
// шрифта ("DejaVuSerif"/"DejaVuSerif-Bold"), не конкретный сгенерированный
// суффикс подмножества, который меняется от сборки к сборке.
export async function extractEmbeddedFontFamilies(pdfBytes: Uint8Array): Promise<{ hasRegular: boolean; hasBold: boolean }> {
  const doc = await PDFDocument.load(pdfBytes);
  let hasRegular = false;
  let hasBold = false;
  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    if (!resources) continue;
    const fontDict = resources.lookup(PDFName.of("Font"), PDFDict);
    if (!fontDict) continue;
    for (const [, ref] of fontDict.entries()) {
      const fontObj = doc.context.lookup(ref, PDFDict);
      const baseFont = fontObj?.get(PDFName.of("BaseFont"))?.toString() ?? "";
      if (baseFont.includes("DejaVuSerif-Bold")) hasBold = true;
      else if (baseFont.includes("DejaVuSerif")) hasRegular = true;
    }
  }
  return { hasRegular, hasBold };
}
