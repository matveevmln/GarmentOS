/* Скриншоты прототипа во всех требуемых ширинах + проверка горизонтального
   скролла и размеров touch target. Запуск:
     node --experimental-default-type=module apps/design-prototype/shots.mjs   */
import { chromium } from "/tmp/claude-0/pw/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve("apps/design-prototype");
const OUT = resolve(DIR, "screenshots");
const URL = "file://" + resolve(DIR, "index.html");

const WIDTHS = [375, 390, 414, 768, 1024, 1280, 1440];
const SCREENS = [
  "dashboard", "batches", "passport", "p-economics", "p-variants",
  "p-materials", "p-documents", "p-history", "models", "materials",
  "purchases", "warehouses", "documents", "finance", "pilot", "more", "states",
];
// Полный набор экранов снимаем на 3 ключевых ширинах; остальные ширины —
// на самых нагруженных экранах (там и вылезают переполнения).
const KEY_WIDTHS = [390, 768, 1440];
const STRESS_SCREENS = ["dashboard", "batches", "passport"];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const problems = [];
let shots = 0;

for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const list = KEY_WIDTHS.includes(w) ? SCREENS : STRESS_SCREENS;

  for (const s of list) {
    await page.goto(`${URL}#${s}`);
    await page.evaluate((n) => window.go(n), s).catch(() => {});
    await page.waitForTimeout(120);

    // При fullPage-съёмке position:fixed элементы застывают на своей
    // экранной позиции и оказываются посреди длинного изображения. Для
    // снимка переводим их в absolute — на картинке они окажутся внизу
    // страницы, как их видит пользователь, прокрутивший до конца.
    await page.addStyleTag({ content:
      ".bottomnav{position:absolute!important}.sticky-action{position:static!important}" });
    await page.screenshot({ path: `${OUT}/${w}-${s}.png`, fullPage: true });
    shots++;

    // 1. Горизонтальный скролл страницы (проверяется на исходных стилях
    //    в отдельной загрузке — см. ниже reload)
    await page.reload();
    await page.evaluate((n) => window.go(n), s).catch(() => {});
    await page.waitForTimeout(80);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) problems.push(`${w}px ${s}: горизонтальный скролл +${overflow}px`);

    // 2. Элементы, выходящие за viewport
    const wide = await page.evaluate((vw) => {
      const bad = [];
      const inScroller = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (getComputedStyle(p).overflowX === "auto") return true;
        }
        return false;
      };
      document.querySelectorAll(".main *").forEach((el) => {
        const r = el.getBoundingClientRect();
        // Элементы внутри намеренного горизонтального скроллера (чипы,
        // широкие таблицы) не считаются переполнением — они прокручиваются
        // внутри своего контейнера, а не ломают страницу.
        if (r.width > 0 && r.right > vw + 1 && !inScroller(el)) {
          bad.push(`${el.className || el.tagName}`.slice(0, 40));
        }
      });
      return [...new Set(bad)].slice(0, 3);
    }, w);
    if (wide.length) problems.push(`${w}px ${s}: за краем — ${wide.join(", ")}`);

    // 3. Touch targets на мобильных ширинах
    if (w < 768) {
      const small = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll("button, a, .chip, summary").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32)) {
            bad.push(`${(el.className || el.tagName).toString().slice(0, 26)} ${Math.round(r.width)}×${Math.round(r.height)}`);
          }
        });
        return [...new Set(bad)].slice(0, 4);
      });
      if (small.length) problems.push(`${w}px ${s}: мелкий touch target — ${small.join("; ")}`);
    }
  }
  await page.close();
  console.log(`✓ ${w}px — ${list.length} экранов`);
}

await browser.close();
console.log(`\nСнимков: ${shots}  →  ${OUT}`);
if (problems.length) {
  console.log(`\n⚠ Найдено проблем: ${problems.length}`);
  problems.forEach((p) => console.log("  · " + p));
} else {
  console.log("\n✓ Проблем не найдено: горизонтального скролла нет, touch targets ≥32px");
}
