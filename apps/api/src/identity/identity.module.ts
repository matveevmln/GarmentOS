import { Module } from "@nestjs/common";
import { CompaniesController } from "./companies.controller";
import { UsersController } from "./users.controller";
import { IdentityService } from "./identity.service";

@Module({
  controllers: [CompaniesController, UsersController],
  providers: [IdentityService],
})
export class IdentityModule {}
