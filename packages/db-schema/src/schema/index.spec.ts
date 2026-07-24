import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "./index";

// Смоук-тест схемы: защита от опечаток в именах таблиц/колонок при рефакторинге
// и проверка, что состав таблиц соответствует docs/DATABASE_SCHEMA.md.

const EXPECTED_TABLES = [
  "companies",
  "users",
  "roles",
  "permissions",
  "role_permissions",
  "user_roles",
  "collections",
  "products",
  "product_variants",
  "materials",
  "suppliers",
  "purchase_orders",
  "purchase_order_items",
  "boms",
  "bom_items",
  "workshops",
  "production_orders",
  "production_order_variants",
  "warehouses",
  "stock_items",
  "stock_movements",
  "inventory_counts",
  "inventory_count_items",
  "shipments",
  "shipment_items",
  "sales_channels",
  "orders",
  "order_items",
  "marketplaces",
  "marketplace_accounts",
  "marketplace_listings",
  "marketplace_sync_logs",
  "marking_codes",
  "marking_code_events",
  "cost_entries",
  "transactions",
  "invoices",
  "audit_log",
  "notifications",
  "documents",
  "document_links",
  "notes",
  "inbox_channels",
  "inbox_items",
  "inbox_suggestions",
];

function collectTables(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).filter(([, value]) => typeof value === "object" && value !== null && "getSQL" in (value as object)),
  );
}

describe("schema", () => {
  it("экспортирует ровно таблицы, описанные в docs/DATABASE_SCHEMA.md", () => {
    const tables = collectTables();
    const actualNames = Object.values(tables)
      .map((table) => getTableName(table as Parameters<typeof getTableName>[0]))
      .sort();

    expect(actualNames).toEqual([...EXPECTED_TABLES].sort());
  });

  it("companies — корень мультитенантности с обязательными полями", () => {
    const columns = getTableColumns(schema.companies);
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining(["id", "name", "createdAt", "updatedAt"]),
    );
  });

  it("каждая корневая доменная таблица содержит company_id — мультитенантность с первого дня", () => {
    const tables = collectTables();
    // Глобальные справочники (не привязаны к тенанту) + строки-детали, которые
    // наследуют тенант через FK на родителя (docs/DATABASE_SCHEMA.md, раздел 1).
    const exempt = new Set([
      "companies",
      "permissions",
      "marketplaces",
      "role_permissions",
      "user_roles",
      "product_variants",
      "bom_items",
      "purchase_order_items",
      "production_order_variants",
      "inventory_counts",
      "inventory_count_items",
      "stock_items",
      "stock_movements",
      "shipment_items",
      "order_items",
      "marketplace_listings",
      "marketplace_sync_logs",
      "marking_code_events",
      "inbox_suggestions",
    ]);

    for (const [key, table] of Object.entries(tables)) {
      const name = getTableName(table as Parameters<typeof getTableName>[0]);
      if (exempt.has(name)) continue;

      const columns = getTableColumns(table as Parameters<typeof getTableColumns>[0]);
      expect(Object.keys(columns), `таблица "${key}" (${name}) должна содержать companyId`).toContain(
        "companyId",
      );
    }
  });
});
