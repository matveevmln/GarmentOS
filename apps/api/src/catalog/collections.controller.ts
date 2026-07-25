import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { collectionResponseSchema, createCollectionSchema, type CollectionResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CatalogService } from "./catalog.service";

class CreateCollectionDto extends createZodDto(createCollectionSchema) {}

@ApiTags("collections")
@Controller("collections")
export class CollectionsController {
  constructor(private readonly catalogService: CatalogService) {}

  @RequirePermissions("catalog.write")
  @Post()
  async create(
    @Body() body: CreateCollectionDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<CollectionResponseDto> {
    const collection = await this.catalogService.createCollection(currentUser.companyId, body);
    return collectionResponseSchema.parse(collection);
  }
}
