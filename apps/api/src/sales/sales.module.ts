import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleOrderRepository, DrizzleSalesChannelRepository } from "@garmentos/domain-sales";
import { DATABASE_CONNECTION } from "../database/database.module";
import { SalesChannelsController } from "./sales-channels.controller";
import { OrdersController } from "./orders.controller";
import { ORDER_REPOSITORY, SALES_CHANNEL_REPOSITORY } from "./sales.tokens";
import { SalesService } from "./sales.service";

@Module({
  controllers: [SalesChannelsController, OrdersController],
  providers: [
    SalesService,
    {
      provide: SALES_CHANNEL_REPOSITORY,
      useFactory: (db: Database) => new DrizzleSalesChannelRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: ORDER_REPOSITORY,
      useFactory: (db: Database) => new DrizzleOrderRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
})
export class SalesModule {}
