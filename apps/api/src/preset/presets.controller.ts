import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createPresetSchema, listPresetsQuerySchema, presetResponseSchema, type PresetResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { PresetService } from "./preset.service";

class CreatePresetDto extends createZodDto(createPresetSchema) {}
class ListPresetsQueryDto extends createZodDto(listPresetsQuerySchema) {}

// Сохранённые числовые значения ("стоимость пошива" / "цена спецификации",
// ПРОМПТ №3, раздел 5) — используются визардом создания заказа пошива и
// карточкой модели как готовые варианты выбора вместо ручного ввода каждый
// раз.
@ApiTags("presets")
@Controller("presets")
export class PresetsController {
  constructor(private readonly presetService: PresetService) {}

  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async list(@Query() query: ListPresetsQueryDto, @CurrentUser() currentUser: AuthenticatedRequestUser): Promise<PresetResponseDto[]> {
    const presets = await this.presetService.list(currentUser.companyId, query.kind);
    return presets.map((preset) => presetResponseSchema.parse(preset));
  }

  @RequirePermissions("contract_manufacturing.write")
  @Post()
  async create(@Body() body: CreatePresetDto, @CurrentUser() currentUser: AuthenticatedRequestUser): Promise<PresetResponseDto> {
    const preset = await this.presetService.add(currentUser.companyId, body.kind, body.value, body.currency, currentUser.id);
    return presetResponseSchema.parse(preset);
  }
}
