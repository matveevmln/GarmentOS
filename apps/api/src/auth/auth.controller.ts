import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { authResponseSchema, loginSchema, refreshSchema, type AuthResponseDto } from "@garmentos/shared-types";
import { Public } from "./public.decorator";
import { AuthService } from "./auth.service";

class LoginDto extends createZodDto(loginSchema) {}
class RefreshDto extends createZodDto(refreshSchema) {}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Rate-limiting только здесь (docs/AUTH_ARCHITECTURE.md, раздел 14, п.6) —
  // базовая защита от перебора паролей, не глобальный лимит на весь API
  // (не должен мешать обычной нагрузке остальных ~40 эндпоинтов).
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(@Body() body: LoginDto): Promise<AuthResponseDto> {
    const result = await this.authService.login(body.email, body.password);
    return authResponseSchema.parse(result);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(@Body() body: RefreshDto): Promise<AuthResponseDto> {
    const result = await this.authService.refresh(body.refreshToken);
    return authResponseSchema.parse(result);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("logout")
  async logout(@Body() body: RefreshDto): Promise<{ success: true }> {
    await this.authService.logout(body.refreshToken);
    return { success: true };
  }
}
