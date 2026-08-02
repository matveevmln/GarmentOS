import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";
import type { Database } from "@garmentos/db-schema";
import { DrizzleRefreshTokenRepository } from "@garmentos/domain-identity";
import { DATABASE_CONNECTION } from "../database/database.module";
import { IdentityModule } from "../identity/identity.module";
import { REFRESH_TOKEN_REPOSITORY } from "./auth.tokens";
import { passwordVerifierProvider } from "./password-verifier.provider";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PermissionsGuard } from "./permissions.guard";

// JwtAuthGuard/PermissionsGuard регистрируются здесь как APP_GUARD — глобально
// для всего приложения (docs/AUTH_ARCHITECTURE.md, раздел 8), а не через
// @UseGuards на каждом из ~40 эндпоинтов 11 модулей: забытый @UseGuards на
// новом контроллере — реальный риск, глобальный guard с явным @Public()
// исключением fail-closed по умолчанию (принцип 10).
@Module({
  imports: [
    IdentityModule,
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 100 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    passwordVerifierProvider,
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useFactory: (db: Database) => new DrizzleRefreshTokenRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
