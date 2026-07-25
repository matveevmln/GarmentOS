import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createUserSchema, userResponseSchema, type UserResponseDto } from "@garmentos/shared-types";
import { IdentityService } from "./identity.service";

class CreateUserDto extends createZodDto(createUserSchema) {}

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly identityService: IdentityService) {}

  @Post()
  async create(@Body() body: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.identityService.createUser(body);
    return userResponseSchema.parse(user);
  }
}
