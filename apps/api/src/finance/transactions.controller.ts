import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { recordTransactionSchema, transactionResponseSchema, type TransactionResponseDto } from "@garmentos/shared-types";
import { FinanceService } from "./finance.service";

class RecordTransactionDto extends createZodDto(recordTransactionSchema) {}

@ApiTags("transactions")
@Controller("transactions")
export class TransactionsController {
  constructor(private readonly financeService: FinanceService) {}

  @Post()
  async record(@Body() body: RecordTransactionDto): Promise<TransactionResponseDto> {
    const transaction = await this.financeService.recordTransaction(body);
    return transactionResponseSchema.parse(transaction);
  }
}
