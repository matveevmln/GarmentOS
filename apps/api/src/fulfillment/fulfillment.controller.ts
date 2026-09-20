import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { fulfillmentBatchListResponseSchema, type FulfillmentBatchListResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { FulfillmentService } from "./fulfillment.service";

// «Фулфилмент ОТК» (ПРОМПТ №3, раздел 10) — минимум на партию: модель,
// фото, номер партии, спецификация, отправлено/принято/брак, статус ОТК.
@ApiTags("fulfillment")
@Controller("fulfillment/batches")
export class FulfillmentController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser): Promise<FulfillmentBatchListResponseDto> {
    const items = await this.fulfillmentService.listBatches(currentUser.companyId);
    return fulfillmentBatchListResponseSchema.parse({ items });
  }
}
