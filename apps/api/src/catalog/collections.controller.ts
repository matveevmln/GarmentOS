import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { collectionResponseSchema, createCollectionSchema, type CollectionResponseDto } from "@garmentos/shared-types";
import { CatalogService } from "./catalog.service";

class CreateCollectionDto extends createZodDto(createCollectionSchema) {}

@ApiTags("collections")
@Controller("collections")
export class CollectionsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  async create(@Body() body: CreateCollectionDto): Promise<CollectionResponseDto> {
    const collection = await this.catalogService.createCollection(body);
    return collectionResponseSchema.parse(collection);
  }
}
