import type { Material, MaterialType, MaterialUnit } from "../domain/material";
import type { PartnerStatus, Supplier, SupplierType } from "../domain/supplier";
import type { PurchaseOrder, PurchaseOrderItemDraft, PurchaseOrderStatus } from "../domain/purchase-order";

export interface NewMaterialInput {
  companyId: string;
  name: string;
  type: MaterialType;
  unit: MaterialUnit;
  reorderPoint: string | null;
  createdBy: string | null;
}

export interface MaterialRepository {
  create(input: NewMaterialInput): Promise<Material>;
  findById(companyId: string, id: string): Promise<Material | null>;
}

export interface NewSupplierInput {
  companyId: string;
  name: string;
  type: SupplierType;
  status: PartnerStatus;
  inn: string | null;
  contactInfo: string | null;
  createdBy: string | null;
}

export interface SupplierRepository {
  create(input: NewSupplierInput): Promise<Supplier>;
  findById(companyId: string, id: string): Promise<Supplier | null>;
}

export interface NewPurchaseOrderInput {
  companyId: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  orderedAt: string;
  expectedDate: string | null;
  createdBy: string | null;
  items: PurchaseOrderItemDraft[];
}

export interface PurchaseOrderRepository {
  create(input: NewPurchaseOrderInput): Promise<PurchaseOrder>;
  findById(companyId: string, id: string): Promise<PurchaseOrder | null>;
  updateStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder>;
}
