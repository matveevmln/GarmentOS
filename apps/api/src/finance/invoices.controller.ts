import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createInvoiceSchema,
  invoiceResponseSchema,
  transitionInvoiceStatusSchema,
  type InvoiceResponseDto,
} from "@garmentos/shared-types";
import { FinanceService } from "./finance.service";

class CreateInvoiceDto extends createZodDto(createInvoiceSchema) {}
class TransitionInvoiceStatusDto extends createZodDto(transitionInvoiceStatusSchema) {}

@ApiTags("invoices")
@Controller("invoices")
export class InvoicesController {
  constructor(private readonly financeService: FinanceService) {}

  @Post()
  async create(@Body() body: CreateInvoiceDto): Promise<InvoiceResponseDto> {
    const invoice = await this.financeService.createInvoice(body);
    return invoiceResponseSchema.parse(invoice);
  }

  @Post(":id/issue")
  async issue(@Param("id") id: string, @Body() body: TransitionInvoiceStatusDto): Promise<InvoiceResponseDto> {
    const invoice = await this.financeService.issueInvoice(body.companyId, id);
    return invoiceResponseSchema.parse(invoice);
  }

  @Post(":id/pay")
  async pay(@Param("id") id: string, @Body() body: TransitionInvoiceStatusDto): Promise<InvoiceResponseDto> {
    const invoice = await this.financeService.markInvoicePaid(body.companyId, id);
    return invoiceResponseSchema.parse(invoice);
  }

  @Post(":id/overdue")
  async overdue(@Param("id") id: string, @Body() body: TransitionInvoiceStatusDto): Promise<InvoiceResponseDto> {
    const invoice = await this.financeService.markInvoiceOverdue(body.companyId, id);
    return invoiceResponseSchema.parse(invoice);
  }

  @Post(":id/cancel")
  async cancel(@Param("id") id: string, @Body() body: TransitionInvoiceStatusDto): Promise<InvoiceResponseDto> {
    const invoice = await this.financeService.cancelInvoice(body.companyId, id);
    return invoiceResponseSchema.parse(invoice);
  }
}
