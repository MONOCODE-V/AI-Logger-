import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SyslogListenerService } from './syslog-listener.service';
import { ScheduledPullService } from './scheduled-pull.service';

@ApiTags('Ingestion')
@ApiBearerAuth()
@Controller('ingestion')
export class IngestionController {
  constructor(
    private readonly syslogListener: SyslogListenerService,
    private readonly scheduledPull: ScheduledPullService,
  ) {}

  // ─── Status Endpoints ─────────────────────────────────────

  @Get('status')
  @ApiOperation({ summary: 'Get overall ingestion status' })
  @ApiResponse({ status: 200, description: 'Returns syslog + pull status' })
  getStatus() {
    return {
      syslog: this.syslogListener.getStatus(),
      scheduledPull: this.scheduledPull.getStatus(),
    };
  }

  @Post('syslog/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh syslog IP cache after adding new sources' })
  async refreshSyslogCache() {
    const status = await this.syslogListener.refreshCache();
    return {
      message: 'Syslog IP cache refreshed',
      status,
    };
  }

  @Get('pull/status')
  @ApiOperation({ summary: 'Get scheduled pull status' })
  getPullStatus() {
    return this.scheduledPull.getStatus();
  }

  // ─── Manual Actions ───────────────────────────────────────

  @Post('pull/trigger/:sourceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger a log pull for a specific source' })
  @ApiResponse({ status: 200, description: 'Pull result' })
  async triggerPull(@Param('sourceId') sourceId: string) {
    return this.scheduledPull.triggerPull(sourceId);
  }

  @Post('pull/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-scan log sources and register new pull jobs' })
  async refreshPullJobs() {
    await this.scheduledPull.registerAllPullJobs();
    return {
      message: 'Pull jobs refreshed',
      status: this.scheduledPull.getStatus(),
    };
  }
}
