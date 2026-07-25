import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createInvoiceSchema, invoiceResponseSchema, type InvoiceResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { FinanceService } from "./finance.service";

class CreateInvoiceDto extends createZodDto(createInvoiceSchema) {}

@ApiTags("invoices")
@Controller("invoices")
export class InvoicesController {
  constructor(private readonly financeService: FinanceService) {}

  @RequirePermissions("finance.write")
  @Post()
  async create(
    @Body() body: CreateInvoiceDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.financeService.createInvoice(currentUser.companyId, body);
    return invoiceResponseSchema.parse(invoice);
  }

  @RequirePermissions("finance.write")
  @Post(":id/issue")
  async issue(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.financeService.issueInvoice(currentUser.companyId, id);
    return invoiceResponseSchema.parse(invoice);
  }

  @RequirePermissions("finance.write")
  @Post(":id/pay")
  async pay(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.financeService.markInvoicePaid(currentUser.companyId, id);
    return invoiceResponseSchema.parse(invoice);
  }

  @RequirePermissions("finance.write")
  @Post(":id/overdue")
  async overdue(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.financeService.markInvoiceOverdue(currentUser.companyId, id);
    return invoiceResponseSchema.parse(invoice);
  }

  @RequirePermissions("finance.write")
  @Post(":id/cancel")
  async cancel(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.financeService.cancelInvoice(currentUser.companyId, id);
    return invoiceResponseSchema.parse(invoice);
  }
}
