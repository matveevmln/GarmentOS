import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import {
  DrizzleDocumentDerivativeRepository,
  DrizzleDocumentLinkRepository,
  DrizzleDocumentRepository,
  PdfLibTemplateRenderer,
  S3StorageAdapter,
  type StorageAdapter,
} from "@garmentos/domain-document";
import { DATABASE_CONNECTION } from "../database/database.module";
import {
  DOCUMENT_DERIVATIVE_REPOSITORY,
  DOCUMENT_LINK_REPOSITORY,
  DOCUMENT_RENDERER,
  DOCUMENT_REPOSITORY,
  STORAGE_ADAPTER,
} from "./document.tokens";
import { DocumentService } from "./document.service";
import { DocumentsController } from "./documents.controller";
import { LocalFileStorageAdapter } from "./local-file-storage-adapter";

// DI-фабрика StorageAdapter — тот же принцип, что TelegramModule/
// ai-production-assistant.module.ts: без настроенного S3_ENDPOINT
// используется локальный диск (не для продакшена, см. local-file-storage-adapter.ts).
function createStorageAdapter(): StorageAdapter {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) {
    return new LocalFileStorageAdapter(process.env.LOCAL_STORAGE_DIR ?? "./.local-storage");
  }
  return new S3StorageAdapter({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "garmentos-local",
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });
}

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentService,
    {
      provide: DOCUMENT_REPOSITORY,
      useFactory: (db: Database) => new DrizzleDocumentRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: DOCUMENT_LINK_REPOSITORY,
      useFactory: (db: Database) => new DrizzleDocumentLinkRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: DOCUMENT_DERIVATIVE_REPOSITORY,
      useFactory: (db: Database) => new DrizzleDocumentDerivativeRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    { provide: STORAGE_ADAPTER, useFactory: createStorageAdapter },
    { provide: DOCUMENT_RENDERER, useClass: PdfLibTemplateRenderer },
  ],
  // DocumentService нужен ai-production-assistant (генерация спецификации
  // после подтверждения заказа, Итерация 7) — переиспользуется.
  exports: [DocumentService],
})
export class DocumentModule {}
