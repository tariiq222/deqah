import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { TenantAwareThrottlerGuard } from "./common/throttler/tenant-aware-throttler.guard";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { APP_GUARD } from "@nestjs/core";
import { ClsModule } from "nestjs-cls";
import { envValidationSchema } from "./config/env.validation";
import { TenantModule } from "./common/tenant";
import { TenantResolverMiddleware } from "./common/tenant/tenant-resolver.middleware";
import { DatabaseModule } from "./infrastructure/database";
import { MessagingModule } from "./infrastructure/messaging.module";
import { AiInfraModule } from "./infrastructure/ai";
import { StorageModule } from "./infrastructure/storage";
import { MailModule } from "./infrastructure/mail";
import { IdentityModule } from "./modules/identity/identity.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { BillingModule } from "./modules/platform/billing/billing.module";
import { VerticalsModule } from "./modules/platform/verticals/verticals.module";
import { PeopleModule } from "./modules/people/people.module";
import { MediaModule } from "./modules/media/media.module";
import { OrgConfigModule } from "./modules/org-config/org-config.module";
import { OrgExperienceModule } from "./modules/org-experience/org-experience.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { ZoomModule } from "./modules/integrations/zoom/zoom.module";
import { ZohoInfrastructureModule } from "./infrastructure/zoho/zoho-infrastructure.module";
import { ZohoInvoiceModule } from "./modules/integrations/zoho-invoice/zoho-invoice.module";
import { SaasZohoModule } from "./modules/platform/saas-billing/zoho/saas-zoho.module";
import { OpsModule } from "./modules/ops/ops.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { AiModule } from "./modules/ai/ai.module";
import { CommsModule } from "./modules/comms/comms.module";
import { ContentModule } from "./modules/content/content.module";
import { MobileClientModule } from "./api/mobile/client/mobile-client.module";
import { MobileEmployeeModule } from "./api/mobile/employee/mobile-employee.module";
import { PublicModule } from "./api/public/public.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    TenantModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // THROTTLER_DISABLED=true disables throttling globally — use for automated test suites
      useFactory: (config: ConfigService) => ({
        skipIf: () => config.get('THROTTLER_DISABLED') === 'true',
        throttlers: [
          { ttl: 60_000, limit: 300 },
          { name: 'admin-mutation', ttl: 60_000, limit: 30 },
          { name: 'admin-mutation-slow', ttl: 60_000, limit: 5 },
        ],
        storage: new ThrottlerStorageRedisService({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          db: config.get<number>('REDIS_DB') ?? 0,
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        }),
      }),
    }),
    DatabaseModule,
    MessagingModule,
    AiInfraModule,
    StorageModule,
    MailModule,
    IdentityModule,
    PlatformModule,
    BillingModule,
    VerticalsModule,
    PeopleModule,
    MediaModule,
    OrgConfigModule,
    OrgExperienceModule,
    FinanceModule,
    BookingsModule,
    ZoomModule,
    ZohoInfrastructureModule,
    ZohoInvoiceModule,
    SaasZohoModule,
    OpsModule,
    DashboardModule,
    AiModule,
    CommsModule,
    ContentModule,
    MobileClientModule,
    MobileEmployeeModule,
    PublicModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: TenantAwareThrottlerGuard },
    TenantResolverMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply after Passport populates req.user. Wildcard covers all routes;
    // unauthenticated routes simply skip enforcement in 'off' mode (default).
    consumer.apply(TenantResolverMiddleware).forRoutes("*");
  }
}
