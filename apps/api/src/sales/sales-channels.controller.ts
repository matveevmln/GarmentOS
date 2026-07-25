import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createSalesChannelSchema,
  salesChannelResponseSchema,
  type SalesChannelResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { SalesService } from "./sales.service";

class CreateSalesChannelDto extends createZodDto(createSalesChannelSchema) {}

@ApiTags("sales-channels")
@Controller("sales-channels")
export class SalesChannelsController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermissions("sales.write")
  @Post()
  async create(
    @Body() body: CreateSalesChannelDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SalesChannelResponseDto> {
    const salesChannel = await this.salesService.createSalesChannel(currentUser.companyId, body);
    return salesChannelResponseSchema.parse(salesChannel);
  }
}
