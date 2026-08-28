// Доменные блоки дизайн-системы — второй слой над примитивами
// (docs/UI_MIGRATION_PLAN.md, этап 3). Перенесены из утверждённого
// прототипа; отличие от него только в типах входных данных: числа и даты
// вместо готовых строк, ключи enum вместо русских подписей (§3 плана).
//
// Экраны на эти компоненты пока не переведены — это этапы 5-8.

export { MoneyBlock } from "./MoneyBlock";
export { ProductionStepper, PRODUCTION_STAGES, isProductionStage } from "./ProductionStepper";
export type { ProductionStage } from "./ProductionStepper";
export { CostBreakdown } from "./CostBreakdown";
export type { CostRow } from "./CostBreakdown";
export { DocumentRow } from "./DocumentRow";
export { Timeline } from "./Timeline";
export type { TimelineItem } from "./Timeline";
export { ModelMark } from "./ModelMark";
export { MetricStrip, CountUp } from "./MetricStrip";
export type { MetricItem } from "./MetricStrip";
export { AttentionList } from "./AttentionList";
export type { AttentionItem } from "./AttentionList";
export { DataTable, Td, MobileListItem } from "./DataTable";
export type { DataTableColumn } from "./DataTable";
export { Accordion } from "./Accordion";
