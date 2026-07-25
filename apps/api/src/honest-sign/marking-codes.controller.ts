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
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { HonestSignService } from "./honest-sign.service";

class IssueMarkingCodeDto extends createZodDto(issueMarkingCodeSchema) {}
class TransitionMarkingCodeDto extends createZodDto(transitionMarkingCodeSchema) {}
class RetireMarkingCodeDto extends createZodDto(retireMarkingCodeSchema) {}

@ApiTags("marking-codes")
@Controller("marking-codes")
export class MarkingCodesController {
  constructor(private readonly honestSignService: HonestSignService) {}

  @RequirePermissions("honest_sign.write")
  @Post()
  async issue(
    @Body() body: IssueMarkingCodeDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<MarkingCodeResponseDto> {
    const markingCode = await this.honestSignService.issue(currentUser.companyId, body);
    return markingCodeResponseSchema.parse(markingCode);
  }

  @RequirePermissions("honest_sign.write")
  @Post(":id/apply")
  async apply(
    @Param("id") id: string,
    @Body() body: TransitionMarkingCodeDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<MarkingCodeResponseDto> {
    const markingCode = await this.honestSignService.apply(currentUser.companyId, id, body);
    return markingCodeResponseSchema.parse(markingCode);
  }

  @RequirePermissions("honest_sign.write")
  @Post(":id/introduce")
  async introduce(
    @Param("id") id: string,
    @Body() body: TransitionMarkingCodeDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<MarkingCodeResponseDto> {
    const markingCode = await this.honestSignService.introduce(currentUser.companyId, id, body);
    return markingCodeResponseSchema.parse(markingCode);
  }

  @RequirePermissions("honest_sign.write")
  @Post(":id/retire")
  async retire(
    @Param("id") id: string,
    @Body() body: RetireMarkingCodeDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<MarkingCodeResponseDto> {
    const markingCode = await this.honestSignService.retire(currentUser.companyId, id, body);
    return markingCodeResponseSchema.parse(markingCode);
  }
}
