import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzlePresetRepository } from "@garmentos/domain-preset";
import { DATABASE_CONNECTION } from "../database/database.module";
import { PresetsController } from "./presets.controller";
import { PresetService } from "./preset.service";
import { PRESET_REPOSITORY } from "./preset.tokens";

@Module({
  controllers: [PresetsController],
  providers: [
    PresetService,
    {
      provide: PRESET_REPOSITORY,
      useFactory: (db: Database) => new DrizzlePresetRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
})
export class PresetModule {}
