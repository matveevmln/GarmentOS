import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  issueMarkingCodeSchema,
  markingCodeResponseSchema,
  retireMarkingCodeSchema,
  transitionMarkingCodeSchema,
  type MarkingCodeResponseDto,
} from "@garmentos/shared-types";
import { HonestSignService } from "./honest-sign.service";

class IssueMarkingCodeDto extends createZodDto(issueMarkingCodeSchema) {}
class TransitionMarkingCodeDto extends createZodDto(transitionMarkingCodeSchema) {}
class RetireMarkingCodeDto extends createZodDto(retireMarkingCodeSchema) {}

@ApiTags("marking-codes")
@Controller("marking-codes")
export class MarkingCodesController {
  constructor(private readonly honestSignService: HonestSignService) {}

  @Post()
  async issue(@Body() body: IssueMarkingCodeDto): Promise<MarkingCodeResponseDto> {
    const markingCode = await this.honestSignService.issue(body);
    return markingCodeResponseSchema.parse(markingCode);
  }

  @Post(":id/apply")
  async apply(@Param("id") id: string, @Body() body: TransitionMarkingCodeDto): Promise<MarkingCodeResponseDto> {
    const markingCode = await this.honestSignService.apply(body.companyId, id, body);
    return markingCodeResponseSchema.parse(markingCode);
  }

  @Post(":id/introduce")
  async introduce(@Param("id") id: string, @Body() body: TransitionMarkingCodeDto): Promise<MarkingCodeResponseDto> {
    const markingCode = await this.honestSignService.introduce(body.companyId, id, body);
    return markingCodeResponseSchema.parse(markingCode);
  }

  @Post(":id/retire")
  async retire(@Param("id") id: string, @Body() body: RetireMarkingCodeDto): Promise<MarkingCodeResponseDto> {
    const markingCode = await this.honestSignService.retire(body.companyId, id, body);
    return markingCodeResponseSchema.parse(markingCode);
  }
}
