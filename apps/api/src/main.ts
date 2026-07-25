import { config as loadEnv } from "dotenv";

loadEnv({ path: "../../.env" });

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { AppModule } from "./app.module";

// Zod-схемы становятся источником и валидации, и OpenAPI-документации
// (PRINCIPLES.md, принцип 1 — API-first) без дублирования отдельными DTO-
// классами (docs/TECH_STACK.md — Zod-схемы переиспользуются между api и web
// через packages/shared-types). cleanupOpenApiDoc — постобработка схем,
// сгенерированных из Zod-DTO (замена patchNestJsSwagger в nestjs-zod v5+,
// использующей встроенную поддержку OpenAPI в zod v4).
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // URI-versioning с первого контроллера (/v1/...) — маршруты будущих 10
  // модулей сразу попадают под версию без миграции путей задним числом.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("GarmentOS API")
    .setDescription("REST API поверх доменных use case (docs/ARCHITECTURE.md)")
    .setVersion("0.1.0")
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, swaggerConfig));
  SwaggerModule.setup("api-docs", app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

void bootstrap();
