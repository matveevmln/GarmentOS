# PDF-regression baseline (спецификация)

Файлы в этой папке обслуживают `../specification-pdf-regression.spec.ts` —
автоматическую проверку, что генератор PDF спецификации не отклонился от
эталонной калибровки (коммит 566d029: геометрия, шрифт DejaVu Serif, условия
оплаты, `specDate`/`legalAddress`/`totalSumNoDecimals`, цвет на отдельной
строке в Products и т.д.).

- `specification-regression-data.ts` — фиксированный набор входных данных.
  Не менять ради удобства теста — любое изменение требует пересчёта baseline.
- `pdf-draw-capture.ts` — инструментирование рендера (перехват
  `PDFPage.drawText`), используется и тестом, и скриптом ниже.
- `specification-regression-baseline.pdf` — эталонный PDF (открывайте
  глазами при пересчёте, чтобы убедиться, что калибровка визуально верна).
- `specification-regression-baseline-draws.json` — тот же рендер как список
  `{text, x, y, size, pageIndex}`; именно с ним тест сравнивает свежий рендер.

## Когда тест падает

Сообщение теста говорит, ЧТО именно разошлось (текст, координата, шрифт,
число страниц). Дальше — два варианта:

1. **Это реальная регрессия** (никто не собирался менять калибровку) —
   чините `../infrastructure/pdf-lib-template-renderer.ts` или
   `../domain/specification-template.ts`, пока тест не станет зелёным. Baseline
   не трогаете.
2. **Это осознанное изменение калибровки** (кто-то реально решил, что
   документ должен выглядеть иначе) — тогда обновите baseline:

   ```bash
   pnpm --filter @garmentos/domain-document build
   node packages/domain/document/src/__fixtures__/regenerate-baseline.js
   ```

   Откройте `specification-regression-baseline.pdf` и убедитесь, что новый
   вид — то, что реально требовалось, только после этого коммитьте оба
   файла вместе с тем изменением рендерера, которое вызвало отличие.

Baseline никогда не обновляется автоматически самим тестом.
