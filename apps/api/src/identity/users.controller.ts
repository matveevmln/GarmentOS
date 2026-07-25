import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createUserSchema, userResponseSchema, type UserResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { IdentityService } from "./identity.service";

class CreateUserDto extends createZodDto(createUserSchema) {}

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly identityService: IdentityService) {}

  // identity.write — только у owner (docs/AUTH_ARCHITECTURE.md, раздел 6):
  // добавление пользователя в компанию — системная настройка, не обычная
  // бизнес-операция.
  @RequirePermissions("identity.write")
  @Post()
  async create(@Body() body: CreateUserDto, @CurrentUser() currentUser: AuthenticatedRequestUser): Promise<UserResponseDto> {
    const user = await this.identityService.createUser(currentUser.companyId, body);
    return userResponseSchema.parse(user);
  }
}
