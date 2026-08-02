import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/public.decorator";

interface HealthStatus {
  status: "ok";
  timestamp: string;
}

// Публичный — балансировщик/оркестратор не аутентифицируется (Итерация 5,
// JwtAuthGuard теперь глобальный).
@Public()
@Controller("health")
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
