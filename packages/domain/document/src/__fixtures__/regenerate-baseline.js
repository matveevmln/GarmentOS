#!/usr/bin/env node
// Регенерация baseline для PDF-regression теста калибровки спецификации
// (packages/domain/document/src/specification-pdf-regression.spec.ts).
// Осознанное действие человека — НЕ запускается автоматически тестами и не
// должно запускаться "чтобы тест прошёл": если тест упал, сначала выясните,
// является ли расхождение реальной регрессией (тогда чините рендерер) или
// осознанным изменением калибровки (тогда, и только тогда, запускайте это).
//
// Использование:
//   pnpm --filter @garmentos/domain-document build   # ../dist должен быть свежим
//   node packages/domain/document/src/__fixtures__/regenerate-baseline.js
//   git diff --stat packages/domain/document/src/__fixtures__/   # сверьте, что изменилось, прежде чем коммитить
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { captureSpecificationRender } = require("../../dist/__fixtures__/pdf-draw-capture");
const { SPECIFICATION_REGRESSION_DATA } = require("../../dist/__fixtures__/specification-regression-data");
const { DEFAULT_SPECIFICATION_TEMPLATE } = require("../../dist/domain/specification-template");

async function main() {
  const { pdfBytes, calls } = await captureSpecificationRender(DEFAULT_SPECIFICATION_TEMPLATE, SPECIFICATION_REGRESSION_DATA);
  const pageCount = calls.reduce((max, call) => Math.max(max, call.pageIndex), 0) + 1;

  const pdfPath = path.join(__dirname, "specification-regression-baseline.pdf");
  const drawsPath = path.join(__dirname, "specification-regression-baseline-draws.json");

  fs.writeFileSync(pdfPath, pdfBytes);
  fs.writeFileSync(drawsPath, JSON.stringify({ pageCount, calls }, null, 2) + "\n");

  console.log(`Записано: ${pdfPath} (${pdfBytes.length} байт)`);
  console.log(`Записано: ${drawsPath} (${calls.length} элементов текста, ${pageCount} стр.)`);
  console.log("Откройте PDF глазами перед коммитом — baseline должен визуально соответствовать эталону (566d029).");
}

main().catch((err) => {
  console.error("Не удалось сгенерировать baseline:", err);
  process.exit(1);
});
