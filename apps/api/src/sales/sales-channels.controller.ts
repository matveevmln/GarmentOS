import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createSalesChannelSchema,
  salesChannelResponseSchema,
  type SalesChannelResponseDto,
} from "@garmentos/shared-types";
import { SalesService } from "./sales.service";

class CreateSalesChannelDto extends createZodDto(createSalesChannelSchema) {}

@ApiTags("sales-channels")
@Controller("sales-channels")
export class SalesChannelsController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  async create(@Body() body: CreateSalesChannelDto): Promise<SalesChannelResponseDto> {
    const salesChannel = await this.salesService.createSalesChannel(body);
    return salesChannelResponseSchema.parse(salesChannel);
  }
}
