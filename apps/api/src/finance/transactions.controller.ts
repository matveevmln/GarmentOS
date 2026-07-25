import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { recordTransactionSchema, transactionResponseSchema, type TransactionResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { FinanceService } from "./finance.service";

class RecordTransactionDto extends createZodDto(recordTransactionSchema) {}

@ApiTags("transactions")
@Controller("transactions")
export class TransactionsController {
  constructor(private readonly financeService: FinanceService) {}

  @RequirePermissions("finance.write")
  @Post()
  async record(
    @Body() body: RecordTransactionDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.financeService.recordTransaction(currentUser.companyId, body);
    return transactionResponseSchema.parse(transaction);
  }
}
