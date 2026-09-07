import { config } from "dotenv";

config({ path: "../../.env" });

// ARCHITECTURE_REVIEW.md, находка 2.3 (P0): e2e-тесты реально пишут/читают
// Postgres, не моки — раньше использовали тот же DATABASE_URL, что и обычная
// разработка, и оставляли в ней тестовый мусор ("E2E Telegram Confirm...").
// Риск первого месяца эксплуатации: если тот же URL когда-нибудь укажет на
// Railway с реальными данными Богдана/Артёма, тестовый прогон испортит
// реальную партию. Здесь — единственное место, где DATABASE_URL
// перезаписывается на выделенную тестовую БД (тот же сервер, суффикс
// `_test` у имени базы) до того, как что-либо ещё в тестовом процессе успеет
// его прочитать. setupFiles гарантированно выполняется раньше кода каждого
// *.spec.ts, а dotenv по умолчанию не переопределяет уже установленную
// переменную — поэтому собственный `config(...)` каждого spec-файла увидит
// уже подменённое значение и не тронет его.
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl.replace(/\/([^/?]+)(\?.*)?$/, (_match, dbName: string, query = "") => {
    if (dbName.endsWith("_test")) return `/${dbName}${query}`;
    return `/${dbName}_test${query}`;
  });
}
