import { Inject, Injectable } from "@nestjs/common";
import {
  authenticateUser,
  issueRefreshToken,
  listUserRoleCodes,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
  type PasswordVerifierPort,
  type RefreshTokenRepository,
  type UserRepository,
  type UserRoleRepository,
} from "@garmentos/domain-identity";
import type { AuthResponseDto } from "@garmentos/shared-types";
import { PASSWORD_VERIFIER, REFRESH_TOKEN_REPOSITORY } from "./auth.tokens";
import { USER_REPOSITORY, USER_ROLE_REPOSITORY } from "../identity/identity.tokens";
import { TokenService } from "./token.service";

// AuthService — presentation-адаптер поверх packages/domain/identity
// (docs/ARCHITECTURE.md, раздел 2), тот же паттерн, что и во всех
// остальных модулях: use case вызываются как функции, DI только для
// репозиториев/портов.
@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_ROLE_REPOSITORY) private readonly userRoles: UserRoleRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_VERIFIER) private readonly passwordVerifier: PasswordVerifierPort,
    private readonly tokenService: TokenService,
  ) {}

  async login(email: string, password: string): Promise<AuthResponseDto> {
    const user = await authenticateUser({ users: this.users, passwordVerifier: this.passwordVerifier }, { email, password });
    const roles = await listUserRoleCodes({ userRoles: this.userRoles }, { userId: user.id });

    const accessToken = this.tokenService.signAccessToken({ sub: user.id, companyId: user.companyId, roles });

    const rawRefreshToken = this.tokenService.generateRefreshTokenValue();
    await issueRefreshToken(
      { refreshTokens: this.refreshTokens },
      {
        userId: user.id,
        tokenHash: this.tokenService.hashRefreshTokenValue(rawRefreshToken),
        familyId: this.tokenService.generateFamilyId(),
        expiresAt: this.tokenService.refreshTokenExpiresAt(),
      },
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: { id: user.id, companyId: user.companyId, email: user.email, fullName: user.fullName, roles },
    };
  }

  async refresh(presentedRefreshToken: string): Promise<AuthResponseDto> {
    const newRawRefreshToken = this.tokenService.generateRefreshTokenValue();

    const rotated = await rotateRefreshToken(
      { refreshTokens: this.refreshTokens },
      {
        presentedTokenHash: this.tokenService.hashRefreshTokenValue(presentedRefreshToken),
        newTokenHash: this.tokenService.hashRefreshTokenValue(newRawRefreshToken),
        newExpiresAt: this.tokenService.refreshTokenExpiresAt(),
      },
    );

    const user = await this.users.findByIdGlobal(rotated.userId);
    if (!user) {
      throw new Error(`Пользователь ${rotated.userId} из refresh-токена не найден — нарушение целостности данных`);
    }
    const roles = await listUserRoleCodes({ userRoles: this.userRoles }, { userId: user.id });
    const accessToken = this.tokenService.signAccessToken({ sub: user.id, companyId: user.companyId, roles });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      user: { id: user.id, companyId: user.companyId, email: user.email, fullName: user.fullName, roles },
    };
  }

  async logout(presentedRefreshToken: string): Promise<void> {
    await revokeRefreshTokenFamily(
      { refreshTokens: this.refreshTokens },
      { tokenHash: this.tokenService.hashRefreshTokenValue(presentedRefreshToken) },
    );
  }
}
