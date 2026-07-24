import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";

// Presentation-слой (docs/ARCHITECTURE.md, п.2). Доменные модули
// (packages/domain/*) подключаются сюда по мере реализации итераций
// Фазы 1 — этот файл не должен содержать бизнес-логики.
@Module({
  imports: [HealthModule],
})
export class AppModule {}
