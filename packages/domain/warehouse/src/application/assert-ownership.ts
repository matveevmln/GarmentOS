import { DomainError } from "../domain/errors";
import type { ProductVariantOwnershipPort, WarehouseRepository } from "./ports";

// SEC-P1 (владелец проекта, 2026-09-24) — общая проверка принадлежности
// склада и SKU компании операции. Вынесена в один модуль, чтобы приёмка/
// списание/перемещение/резерв/снятие резерва/отгрузки не расходились в
// формулировке кода ошибки: единый маппинг на HTTP 404 по суффиксу
// `_NOT_FOUND` (apps/api/src/common/domain-exception.filter.ts) — чужой
// склад/SKU и несуществующий склад/SKU не должны различаться для
// вызывающего (docs/tasks/SEC-P1.md: «не возвращать 500», «не раскрывать
// данные другой компании»).
export async function assertWarehouseOwnership(
  warehouses: WarehouseRepository,
  companyId: string,
  warehouseId: string,
): Promise<void> {
  const warehouse = await warehouses.findById(companyId, warehouseId);
  if (!warehouse) {
    throw new DomainError(`Склад ${warehouseId} не найден в этой компании`, "WAREHOUSE_NOT_FOUND");
  }
}

export async function assertProductVariantOwnership(
  productVariants: ProductVariantOwnershipPort,
  companyId: string,
  productVariantId: string,
): Promise<void> {
  const belongs = await productVariants.belongsToCompany(companyId, productVariantId);
  if (!belongs) {
    throw new DomainError(`SKU ${productVariantId} не найден в этой компании`, "PRODUCT_VARIANT_NOT_FOUND");
  }
}
