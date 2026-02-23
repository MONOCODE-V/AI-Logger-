import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Alert, AlertStatus } from './entities/alert.entity';
import { AlertRule, RuleStatus } from './entities/alert-rule.entity';
import { CreateAlertDto, QueryAlertsDto, AcknowledgeAlertDto, ResolveAlertDto } from './dto/alert.dto';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { RulesEngineService } from './services/rules-engine.service';
import { NotificationsService } from './services/notifications.service';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertsRepository: Repository<Alert>,
    @InjectRepository(AlertRule)
    private readonly rulesRepository: Repository<AlertRule>,
    private readonly rulesEngine: RulesEngineService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==================== ALERTS ====================

  async createAlert(dto: CreateAlertDto): Promise<Alert> {
    const alert = this.alertsRepository.create({
      ...dto,
      status: AlertStatus.ACTIVE,
    });
    return this.alertsRepository.save(alert);
  }

  async findAllAlerts(query: QueryAlertsDto): Promise<Alert[]> {
    const where: any = {};
    
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.sourceId) where.sourceId = query.sourceId;

    return this.alertsRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: query.limit || 50,
    });
  }

  async findOneAlert(id: string): Promise<Alert> {
    const alert = await this.alertsRepository.findOne({ where: { id } });
    if (!alert) {
      throw new NotFoundException(`Alert #${id} not found`);
    }
    return alert;
  }

  async acknowledgeAlert(id: string, userId: string, dto: AcknowledgeAlertDto): Promise<Alert> {
    const alert = await this.findOneAlert(id);
    
    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = new Date();
    if (dto.notes) {
      alert.resolutionNotes = dto.notes;
    }

    return this.alertsRepository.save(alert);
  }

  async resolveAlert(id: string, userId: string, dto: ResolveAlertDto): Promise<Alert> {
    const alert = await this.findOneAlert(id);
    
    alert.status = AlertStatus.RESOLVED;
    alert.resolvedAt = new Date();
    alert.resolutionNotes = dto.notes;
    if (!alert.acknowledgedBy) {
      alert.acknowledgedBy = userId;
      alert.acknowledgedAt = new Date();
    }

    return this.alertsRepository.save(alert);
  }

  async silenceAlert(id: string): Promise<Alert> {
    const alert = await this.findOneAlert(id);
    alert.status = AlertStatus.SILENCED;
    return this.alertsRepository.save(alert);
  }

  async deleteAlert(id: string): Promise<void> {
    const alert = await this.findOneAlert(id);
    await this.alertsRepository.remove(alert);
  }

  async getAlertStats(): Promise<{
    total: number;
    byStatus: Record<AlertStatus, number>;
    bySeverity: Record<string, number>;
    recentCount: number;
  }> {
    const total = await this.alertsRepository.count();

    const byStatusRaw = await this.alertsRepository
      .createQueryBuilder('alert')
      .select('alert.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('alert.status')
      .getRawMany();

    const byStatus = {} as Record<AlertStatus, number>;
    for (const status of Object.values(AlertStatus)) {
      byStatus[status] = 0;
    }
    for (const row of byStatusRaw) {
      byStatus[row.status as AlertStatus] = parseInt(row.count, 10);
    }

    const bySeverityRaw = await this.alertsRepository
      .createQueryBuilder('alert')
      .select('alert.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .groupBy('alert.severity')
      .getRawMany();

    const bySeverity: Record<string, number> = {};
    for (const row of bySeverityRaw) {
      bySeverity[row.severity] = parseInt(row.count, 10);
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await this.alertsRepository.count({
      where: {
        createdAt: MoreThanOrEqual(oneHourAgo),
        status: AlertStatus.ACTIVE,
      },
    });

    return { total, byStatus, bySeverity, recentCount };
  }

  // ==================== RULES ====================

  async createRule(dto: CreateAlertRuleDto, ownerId: string): Promise<AlertRule> {
    const rule = this.rulesRepository.create({
      ...dto,
      ownerId,
    });
    return this.rulesRepository.save(rule);
  }

  async findAllRules(ownerId?: string): Promise<AlertRule[]> {
    const where = ownerId ? { ownerId } : {};
    return this.rulesRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOneRule(id: string): Promise<AlertRule> {
    const rule = await this.rulesRepository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException(`Alert Rule #${id} not found`);
    }
    return rule;
  }

  async updateRule(id: string, dto: UpdateAlertRuleDto): Promise<AlertRule> {
    const rule = await this.findOneRule(id);
    Object.assign(rule, dto);
    return this.rulesRepository.save(rule);
  }

  async deleteRule(id: string): Promise<void> {
    const rule = await this.findOneRule(id);
    await this.rulesRepository.remove(rule);
  }

  async enableRule(id: string): Promise<AlertRule> {
    const rule = await this.findOneRule(id);
    rule.status = RuleStatus.ENABLED;
    return this.rulesRepository.save(rule);
  }

  async disableRule(id: string): Promise<AlertRule> {
    const rule = await this.findOneRule(id);
    rule.status = RuleStatus.DISABLED;
    return this.rulesRepository.save(rule);
  }

  async testRule(id: string) {
    return this.rulesEngine.testRule(id);
  }

  // ==================== EVALUATION ====================

  async evaluateRules(sourceId?: string) {
    return this.rulesEngine.evaluateAllRules(sourceId);
  }

  // ==================== NOTIFICATIONS ====================

  async testNotification(
    type: 'email' | 'webhook' | 'slack' | 'in_app',
    config: Record<string, any>,
  ) {
    return this.notificationsService.testChannel(type, config);
  }
}
