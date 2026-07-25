import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleBomRepository } from "@garmentos/domain-bom";
import { DATABASE_CONNECTION } from "../database/database.module";
import { BomsController } from "./boms.controller";
import { BOM_REPOSITORY } from "./bom.tokens";
import { BomService } from "./bom.service";

@Module({
  controllers: [BomsController],
  providers: [
    BomService,
    {
      provide: BOM_REPOSITORY,
      useFactory: (db: Database) => new DrizzleBomRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
})
export class BomModule {}
