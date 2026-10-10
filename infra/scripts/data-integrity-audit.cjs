// Проверка существующих данных без записи. Запуск из контейнера API:
// node /repo/infra/scripts/data-integrity-audit.cjs
// Пароли, названия компаний и пользовательские данные не выводятся.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const postgres = createRequire(resolve(__dirname, "../../packages/db-schema/package.json"))("postgres");

const checks = {
  production_variant_model: `select count(*) as count from production_order_variants v
    join production_orders o on o.id=v.production_order_id
    join product_variants pv on pv.id=v.product_variant_id
    where pv.product_id<>o.product_id`,
  production_company: `select count(*) as count from production_orders o
    join products p on p.id=o.product_id join workshops w on w.id=o.workshop_id
    where p.company_id<>o.company_id or w.company_id<>o.company_id`,
  purchase_material_company: `select count(*) as count from purchase_order_items i
    join purchase_orders o on o.id=i.purchase_order_id join materials m on m.id=i.material_id
    where m.company_id<>o.company_id`,
  stock_company: `select count(*) as count from stock_items s
    join warehouses w on w.id=s.warehouse_id join product_variants v on v.id=s.product_variant_id
    join products p on p.id=v.product_id where w.company_id<>p.company_id`,
  material_stock_company: `select count(*) as count from material_stock_items s
    join warehouses w on w.id=s.warehouse_id join materials m on m.id=s.material_id
    where w.company_id<>m.company_id`,
  material_balance_vs_movements: `select count(*) as count from material_stock_items s
    left join (select material_stock_item_id,
      sum(case when type='consumption' then -quantity else quantity end) as balance
      from material_stock_movements group by material_stock_item_id) m on m.material_stock_item_id=s.id
    where s.quantity_on_hand<>coalesce(m.balance,0)`,
  received_variant_vs_receipts: `select count(*) as count from
    (select o.id,v.product_variant_id,sum(coalesce(v.received_quantity,v.quantity)) as expected
     from production_orders o join production_order_variants v on v.production_order_id=o.id
     where o.status in ('received','completed') group by o.id,v.product_variant_id) r
    left join (select coalesce(c.production_order_id,m.reference_id) as reference_id,s.product_variant_id,sum(m.quantity) as actual
     from stock_movements m join stock_items s on s.id=m.stock_item_id
     left join receipt_corrections c on m.reference_type='production_order_receipt_correction' and c.id=m.reference_id
     where (m.reference_type='production_order' and m.type='receipt') or (m.reference_type='production_order_receipt_correction' and c.id is not null and m.type='adjustment')
     group by coalesce(c.production_order_id,m.reference_id),s.product_variant_id) m
    on m.reference_id=r.id and m.product_variant_id=r.product_variant_id
    where r.expected<>coalesce(m.actual,0)`,
  qc_totals: `select count(*) as count from production_order_qc_results
    where received_quantity<>good_quantity+defect_quantity`,
  qc_vs_defects: `select count(*) as count from production_order_qc_results q
    left join (select qc_result_id,sum(quantity) as quantity from production_order_defects
     group by qc_result_id) d on d.qc_result_id=q.id
    where q.defect_quantity<>coalesce(d.quantity,0)`,
  cutting_company: `select count(*) as count from cutting_orders c
    join production_orders o on o.id=c.production_order_id where c.company_id<>o.company_id`,
  cancelled_order_active_cutting: `select count(*) as count from cutting_orders c
    join production_orders o on o.id=c.production_order_id
    where o.status='cancelled' and c.status not in ('cancelled','completed')`,
};

async function run() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL отсутствует");
  const db = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  try {
    const result = await db.begin("isolation level repeatable read read only", async (tx) => {
      await tx.unsafe("set local statement_timeout = '15s'");
      const results = {};
      for (const [name, query] of Object.entries(checks)) {
        const [row] = await tx.unsafe(query);
        results[name] = Number(row.count);
      }
      return results;
    });
    console.log(JSON.stringify({ audit: "data-integrity", readOnly: true, checkedAt: new Date().toISOString(), checks: result }));
  } catch (error) {
    // Текст ошибки драйвера может содержать сведения о подключении.
    console.error(JSON.stringify({ audit: "data-integrity", failed: true, code: error.code ?? "AUDIT_FAILED" }));
    process.exitCode = 1;
  } finally {
    await db.end({ timeout: 5 });
  }
}

run().catch(() => { console.error("Ошибка запуска проверки данных"); process.exitCode = 1; });
