import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { Alert } from './entities/alert.entity';
import { AlertRule } from './entities/alert-rule.entity';
import {
  CreateAlertDto,
  QueryAlertsDto,
  AcknowledgeAlertDto,
  ResolveAlertDto,
} from './dto/alert.dto';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '../auth/interfaces/current-user.interface';

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  // ==================== ALERTS ====================

  @Post()
  @ApiOperation({ summary: 'Create a manual alert' })
  @ApiResponse({ status: 201, type: Alert })
  createAlert(@Body() dto: CreateAlertDto): Promise<Alert> {
    return this.alertsService.createAlert(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all alerts with optional filters' })
  @ApiResponse({ status: 200, type: [Alert] })
  findAllAlerts(@Query() query: QueryAlertsDto): Promise<Alert[]> {
    return this.alertsService.findAllAlerts(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get alert statistics' })
  getStats() {
    return this.alertsService.getAlertStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific alert' })
  @ApiResponse({ status: 200, type: Alert })
  findOneAlert(@Param('id') id: string): Promise<Alert> {
    return this.alertsService.findOneAlert(id);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acknowledge an alert' })
  @ApiResponse({ status: 200, type: Alert })
  acknowledgeAlert(
    @Param('id') id: string,
    @Body() dto: AcknowledgeAlertDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Alert> {
    return this.alertsService.acknowledgeAlert(id, user.id, dto);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve an alert' })
  @ApiResponse({ status: 200, type: Alert })
  resolveAlert(
    @Param('id') id: string,
    @Body() dto: ResolveAlertDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Alert> {
    return this.alertsService.resolveAlert(id, user.id, dto);
  }

  @Post(':id/silence')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Silence an alert' })
  @ApiResponse({ status: 200, type: Alert })
  silenceAlert(@Param('id') id: string): Promise<Alert> {
    return this.alertsService.silenceAlert(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an alert' })
  deleteAlert(@Param('id') id: string): Promise<void> {
    return this.alertsService.deleteAlert(id);
  }

  // ==================== RULES ====================

  @Post('rules')
  @ApiOperation({ summary: 'Create an alert rule' })
  @ApiResponse({ status: 201, type: AlertRule })
  createRule(
    @Body() dto: CreateAlertRuleDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<AlertRule> {
    return this.alertsService.createRule(dto, user.id);
  }

  @Get('rules')
  @ApiOperation({ summary: 'Get all alert rules' })
  @ApiResponse({ status: 200, type: [AlertRule] })
  findAllRules(@CurrentUser() user: ICurrentUser): Promise<AlertRule[]> {
    return this.alertsService.findAllRules();
  }

  @Get('rules/:id')
  @ApiOperation({ summary: 'Get a specific alert rule' })
  @ApiResponse({ status: 200, type: AlertRule })
  findOneRule(@Param('id') id: string): Promise<AlertRule> {
    return this.alertsService.findOneRule(id);
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Update an alert rule' })
  @ApiResponse({ status: 200, type: AlertRule })
  updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateAlertRuleDto,
  ): Promise<AlertRule> {
    return this.alertsService.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an alert rule' })
  deleteRule(@Param('id') id: string): Promise<void> {
    return this.alertsService.deleteRule(id);
  }

  @Post('rules/:id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable an alert rule' })
  enableRule(@Param('id') id: string): Promise<AlertRule> {
    return this.alertsService.enableRule(id);
  }

  @Post('rules/:id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable an alert rule' })
  disableRule(@Param('id') id: string): Promise<AlertRule> {
    return this.alertsService.disableRule(id);
  }

  @Post('rules/:id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test an alert rule without triggering' })
  testRule(@Param('id') id: string) {
    return this.alertsService.testRule(id);
  }

  // ==================== EVALUATION ====================

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually evaluate all rules' })
  evaluateRules(@Query('sourceId') sourceId?: string) {
    return this.alertsService.evaluateRules(sourceId);
  }

  // ==================== NOTIFICATIONS ====================

  @Post('test-notification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a notification channel' })
  testNotification(
    @Body() body: { type: 'email' | 'webhook' | 'slack' | 'in_app'; config: Record<string, any> },
  ) {
    return this.alertsService.testNotification(body.type, body.config);
  }
}
