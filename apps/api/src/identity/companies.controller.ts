import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { companyResponseSchema, createCompanySchema, type CompanyResponseDto } from "@garmentos/shared-types";
import { IdentityService } from "./identity.service";

class CreateCompanyDto extends createZodDto(createCompanySchema) {}

@ApiTags("companies")
@Controller("companies")
export class CompaniesController {
  constructor(private readonly identityService: IdentityService) {}

  @Post()
  async create(@Body() body: CreateCompanyDto): Promise<CompanyResponseDto> {
    const company = await this.identityService.createCompany(body);
    return companyResponseSchema.parse(company);
  }
}
