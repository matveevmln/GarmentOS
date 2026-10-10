import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import {
  correctReceiptSchema,
  recordBatchPaymentSchema,
  reverseBatchPaymentSchema,
  productionOrderResponseSchema,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { BatchOperationsService } from "./batch-operations.service";
class CorrectReceiptBody extends createZodDto(correctReceiptSchema) {}
class PaymentBody extends createZodDto(recordBatchPaymentSchema) {}
class ReverseBody extends createZodDto(reverseBatchPaymentSchema) {}

@Controller("production-orders")
export class BatchOperationsController {
  constructor(private readonly operations: BatchOperationsService) {}
  @Get(":id/receipt-correction")
  @RequirePermissions("contract_manufacturing.read")
  availability(@Param("id") id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.operations.receiptAvailability(user.companyId, id, user.id);
  }
  @Post(":id/receipt-correction")
  @RequirePermissions("contract_manufacturing.rollback")
  async correct(
    @Param("id") id: string,
    @Body() body: CorrectReceiptBody,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return productionOrderResponseSchema.parse(
      await this.operations.correctReceipt(user, id, body),
    );
  }
  @Get(":id/settlement")
  @RequirePermissions("contract_manufacturing.read", "finance.read")
  settlement(@Param("id") id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.operations.settlement(user, id);
  }
  @Post(":id/payments")
  @RequirePermissions("contract_manufacturing.write", "finance.write")
  payment(
    @Param("id") id: string,
    @Body() body: PaymentBody,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return this.operations.recordPayment(user, id, body);
  }
  @Post(":id/payments/:paymentId/reverse")
  @RequirePermissions("contract_manufacturing.write", "finance.write")
  reverse(
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Body() body: ReverseBody,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return this.operations.reversePayment(user, id, paymentId, body);
  }
}
