import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleMarkingCodeRepository } from "@garmentos/domain-honest-sign";
import { DATABASE_CONNECTION } from "../database/database.module";
import { MarkingCodesController } from "./marking-codes.controller";
import { MARKING_CODE_REPOSITORY } from "./honest-sign.tokens";
import { HonestSignService } from "./honest-sign.service";

@Module({
  controllers: [MarkingCodesController],
  providers: [
    HonestSignService,
    {
      provide: MARKING_CODE_REPOSITORY,
      useFactory: (db: Database) => new DrizzleMarkingCodeRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
})
export class HonestSignModule {}
