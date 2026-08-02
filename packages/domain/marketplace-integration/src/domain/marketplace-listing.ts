import { DomainError } from "./errors";

// Карточка SKU на конкретном маркетплейсе — сопоставление нашего SKU с
// external_sku_id площадки, текущая цена/остаток, репортированные площадкой
// (docs/DATABASE_SCHEMA.md, раздел 12).
export interface MarketplaceListing {
  id: string;
  marketplaceAccountId: string;
  productVariantId: string;
  externalSkuId: string;
  currentPrice: string | null;
  currentStockReported: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function assertValidExternalSkuId(externalSkuId: string): void {
  if (externalSkuId.trim().length === 0) {
    throw new DomainError("Внешний ID SKU на маркетплейсе не может быть пустым", "LISTING_EXTERNAL_SKU_ID_REQUIRED");
  }
}

export function assertValidPrice(price: number): void {
  if (price < 0) {
    throw new DomainError(`Цена не может быть отрицательной (получено ${price})`, "LISTING_PRICE_INVALID");
  }
}

export function assertValidStock(stock: number): void {
  if (stock < 0) {
    throw new DomainError(`Остаток не может быть отрицательным (получено ${stock})`, "LISTING_STOCK_INVALID");
  }
}
