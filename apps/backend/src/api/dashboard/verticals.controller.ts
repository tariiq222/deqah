import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/**
 * Placeholder — all verticals mutations were removed (audit finding P1 #18).
 * Verticals are platform-level config; tenants must never mutate them.
 * Canonical mutation surface: AdminVerticalsController (api/admin/verticals.controller.ts).
 *
 * This class is kept registered in PlatformModule to avoid a module config change.
 * It exposes zero endpoints.
 */
@ApiTags('Dashboard / Platform')
@Controller('dashboard/verticals')
export class DashboardVerticalsController {}
