import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createProductionOrderFromSpecificationSchema,
  createSpecificationDraftSchema,
  createSpecificationFromExistingSchema,
  documentResponseSchema,
  listSpecificationsQuerySchema,
  productionOrderResponseSchema,
  specificationAvailableQuantityResponseSchema,
  specificationResponseSchema,
  updateSpecificationSchema,
  type DocumentResponseDto,
  type ProductionOrderResponseDto,
  type SpecificationAvailableQuantityResponseDto,
  type SpecificationResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { SpecificationService } from "./specification.service";

class CreateSpecificationDraftDto extends createZodDto(createSpecificationDraftSchema) {}
class CreateSpecificationFromExistingDto extends createZodDto(createSpecificationFromExistingSchema) {}
class ListSpecificationsQueryDto extends createZodDto(listSpecificationsQuerySchema) {}
class CreateProductionOrderFromSpecificationDto extends createZodDto(createProductionOrderFromSpecificationSchema) {}
class UpdateSpecificationDto extends createZodDto(updateSpecificationSchema) {}

// Спецификация — самостоятельная бизнес-сущность, первый шаг производства
// (владелец проекта, 2026-09-11 — «Production Master»), не производный
// документ производственного заказа. companyId — всегда из @CurrentUser(),
// никогда из тела/URL запроса (тот же принцип, что и во всех остальных
// контроллерах после Step 4A.2 — tenant isolation).
@ApiTags("specifications")
@Controller("specifications")
export class SpecificationsController {
  constructor(private readonly specificationService: SpecificationService) {}

  @RequirePermissions("specification.write")
  @Post()
  async create(
    @Body() body: CreateSpecificationDraftDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SpecificationResponseDto> {
    const spec = await this.specificationService.createDraft(currentUser.companyId, body, currentUser.id);
    return specificationResponseSchema.parse(spec);
  }

  // «Создать на основе существующей» (требование №3) — отдельная операция
  // Specification → Specification, не «Следующий заказ» и не «Дублировать
  // заказ» (те работают с production_orders, к спецификации отношения не
  // имеют). Источник (sourceSpecificationId в теле) остаётся неизменным.
  @RequirePermissions("specification.write")
  @Post("from-existing")
  async createFromExisting(
    @Body() body: CreateSpecificationFromExistingDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SpecificationResponseDto> {
    const spec = await this.specificationService.createFromExisting(currentUser.companyId, body, currentUser.id);
    return specificationResponseSchema.parse(spec);
  }

  // Утверждение — отдельное право от write (требование №9 + тот же принцип,
  // что bom.approve): необратимо замораживает Snapshot и коммитит номер.
  @RequirePermissions("specification.approve")
  @Post(":id/approve")
  async approve(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SpecificationResponseDto> {
    const spec = await this.specificationService.approve(currentUser.companyId, id);
    return specificationResponseSchema.parse(spec);
  }

  // «Сформировать спецификацию» / «Сформировать заново» (требование №17) —
  // PDF строится из уже замороженного snapshotJson, не из живых данных
  // (SpecificationService.generateDocument). Скачивание/показ существующих
  // документов — уже существующие generic-эндпоинты Document Engine
  // (GET /documents?entityType=specification&entityId=... и
  // GET /documents/:id/file), новый маршрут здесь не нужен.
  @RequirePermissions("specification.write")
  @Post(":id/document")
  async generateDocument(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<DocumentResponseDto> {
    const result = await this.specificationService.generateDocument(currentUser.companyId, id, currentUser.id);
    return documentResponseSchema.parse(result.document);
  }

  // Правка спецификации NEW-потока (ПРОМПТ №3, раздел 4/9) — редактируемый
  // документ, без approve/freeze. Право write (не отдельное право, в отличие
  // от rollback партии) — та же операция концептуально, что и create.
  // Legacy-спецификации и отменённые — домен отклоняет сам (assertIsNewFlowSpecification/assertCanEdit).
  @RequirePermissions("specification.write")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateSpecificationDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SpecificationResponseDto> {
    const spec = await this.specificationService.update(currentUser.companyId, id, body, currentUser.id);
    return specificationResponseSchema.parse(spec);
  }

  // Отмена — терминальное состояние. NEW-поток: доступна, пока не отменена
  // (assertCanEdit). LEGACY-поток: только пока черновик (assertIsDraft) —
  // утверждённую LEGACY-спецификацию эта операция не трогает (аудит
  // пользовательского пути, owner, 2026-09-21 — см. cancel-specification.ts).

  @RequirePermissions("specification.write")
  @Post(":id/cancel")
  async cancel(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SpecificationResponseDto> {
    const spec = await this.specificationService.cancel(currentUser.companyId, id, currentUser.id);
    return specificationResponseSchema.parse(spec);
  }

  @RequirePermissions("specification.read")
  @Get()
  async list(
    @Query() query: ListSpecificationsQueryDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SpecificationResponseDto[]> {
    const specs = await this.specificationService.listByCompany(currentUser.companyId, query);
    return specs.map((spec) => specificationResponseSchema.parse(spec));
  }

  @RequirePermissions("specification.read")
  @Get(":id")
  async findById(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SpecificationResponseDto> {
    const spec = await this.specificationService.findById(currentUser.companyId, id);
    return specificationResponseSchema.parse(spec);
  }

  // Остаток спецификации по строкам (Этап 3 «Production Master», владелец
  // проекта, 2026-09-12) — сколько ещё не размещено ни в одной
  // производственной партии; нужен UI кнопки «Создать производственную
  // партию», чтобы не позволить выбрать больше доступного. Все расчёты —
  // backend.
  @RequirePermissions("specification.read")
  @Get(":id/available-quantity")
  async availableQuantity(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SpecificationAvailableQuantityResponseDto> {
    const result = await this.specificationService.getAvailableQuantity(currentUser.companyId, id);
    return specificationAvailableQuantityResponseSchema.parse(result);
  }

  // Создание производственной партии из утверждённой спецификации (Этап 3) —
  // auto-confirm, партия сразу получает номер и статус "placed" (владелец
  // проекта: отдельная кнопка «Подтвердить» для этого сценария не нужна).
  // Право — contract_manufacturing.write: эндпоинт создаёт production_order,
  // тот же permission, что и прямое создание заказа пошива.
  @RequirePermissions("contract_manufacturing.write")
  @Post(":id/production-order")
  async createProductionOrder(
    @Param("id") id: string,
    @Body() body: CreateProductionOrderFromSpecificationDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const order = await this.specificationService.createProductionOrder(currentUser.companyId, id, body, currentUser.id);
    return productionOrderResponseSchema.parse(order);
  }
}
