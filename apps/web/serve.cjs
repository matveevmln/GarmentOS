// Минимальный статический сервер для собранного SPA (apps/web/dist) в
// проде (Railway/VPS-контейнер) — без дополнительной зависимости вроде
// `serve` (docs/PRINCIPLES.md, принцип 3 — не подключаем библиотеку без
// доказанной необходимости). Отдаёт index.html для любого пути без
// расширения — иначе прямой переход по ссылке на маршрут React Router
// (например /products/:id) вернул бы 404 от сервера.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const distDir = path.join(__dirname, "dist");
const port = process.env.PORT ? Number(process.env.PORT) : 4173;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

http
  .createServer((req, res) => {
    const requestedPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const hasExtension = path.extname(requestedPath) !== "";
    const filePath = path.join(distDir, hasExtension ? requestedPath : "index.html");

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream" });
      res.end(content);
    });
  })
  .listen(port, () => {
    console.log(`apps/web static server listening on :${port}`);
  });
