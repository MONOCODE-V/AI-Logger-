import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { AlertRule, RuleCondition, RuleConditionType, RuleStatus } from '../entities/alert-rule.entity';
import { Alert, AlertStatus } from '../entities/alert.entity';
import { Log, LogLevel } from '../../logs/entities/log.entity';
import { LogsService } from '../../logs/logs.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  matchedLogs: string[];
  reason?: string;
}

/**
 * RulesEngineService - Evaluates alert rules against logs and triggers alerts.
 */
@Injectable()
export class RulesEngineService {
  private readonly logger = new Logger(RulesEngineService.name);

  constructor(
    @InjectRepository(AlertRule)
    private readonly rulesRepository: Repository<AlertRule>,
    @InjectRepository(Alert)
    private readonly alertsRepository: Repository<Alert>,
    private readonly logsService: LogsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Evaluate all enabled rules against recent logs
   */
  async evaluateAllRules(sourceId?: string): Promise<RuleEvaluationResult[]> {
    const where: any = { status: RuleStatus.ENABLED };
    if (sourceId) {
      where.sourceId = In([sourceId, null]); // Rules for this source or global rules
    }

    const rules = await this.rulesRepository.find({ where });
    const results: RuleEvaluationResult[] = [];

    for (const rule of rules) {
      const result = await this.evaluateRule(rule);
      results.push(result);

      if (result.triggered) {
        await this.triggerAlert(rule, result);
      }
    }

    return results;
  }

  /**
   * Evaluate a single rule
   */
  async evaluateRule(rule: AlertRule): Promise<RuleEvaluationResult> {
    // Check cooldown
    if (rule.lastTriggeredAt) {
      const cooldownEnd = new Date(rule.lastTriggeredAt.getTime() + rule.cooldownMinutes * 60 * 1000);
      if (new Date() < cooldownEnd) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          triggered: false,
          matchedLogs: [],
          reason: 'In cooldown period',
        };
      }
    }

    // Evaluate all conditions (AND logic)
    const matchedLogs: string[] = [];
    let allConditionsMet = true;

    for (const condition of rule.conditions) {
      const conditionResult = await this.evaluateCondition(condition, rule.sourceId);
      
      if (!conditionResult.met) {
        allConditionsMet = false;
        break;
      }

      matchedLogs.push(...conditionResult.logIds);
    }

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: allConditionsMet,
      matchedLogs: [...new Set(matchedLogs)], // Deduplicate
      reason: allConditionsMet ? 'All conditions met' : 'Not all conditions met',
    };
  }

  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(
    condition: RuleCondition,
    sourceId?: string,
  ): Promise<{ met: boolean; logIds: string[] }> {
    const { type, params } = condition;

    switch (type) {
      case RuleConditionType.ERROR_COUNT:
        return this.evaluateErrorCount(params, sourceId);
      case RuleConditionType.ERROR_RATE:
        return this.evaluateErrorRate(params, sourceId);
      case RuleConditionType.LOG_LEVEL:
        return this.evaluateLogLevel(params, sourceId);
      case RuleConditionType.KEYWORD_MATCH:
        return this.evaluateKeywordMatch(params, sourceId);
      case RuleConditionType.NO_LOGS:
        return this.evaluateNoLogs(params, sourceId);
      default:
        return { met: false, logIds: [] };
    }
  }

  private async evaluateErrorCount(
    params: Record<string, any>,
    sourceId?: string,
  ): Promise<{ met: boolean; logIds: string[] }> {
    const { threshold, timeWindowMinutes = 5 } = params;
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

    const { data: logs } = await this.logsService.findAll({
      sourceId,
      levels: 'error,fatal',
      startTime: since.toISOString(),
      limit: threshold + 1,
    });

    return {
      met: logs.length >= threshold,
      logIds: logs.map(l => l.id),
    };
  }

  private async evaluateErrorRate(
    params: Record<string, any>,
    sourceId?: string,
  ): Promise<{ met: boolean; logIds: string[] }> {
    const { threshold, timeWindowMinutes = 5 } = params;
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

    const { data: allLogs, total } = await this.logsService.findAll({
      sourceId,
      startTime: since.toISOString(),
      limit: 1000,
    });

    if (total === 0) {
      return { met: false, logIds: [] };
    }

    const errorLogs = allLogs.filter(l => 
      l.level === LogLevel.ERROR || l.level === LogLevel.FATAL
    );

    const errorRate = errorLogs.length / total;

    return {
      met: errorRate >= threshold,
      logIds: errorLogs.map(l => l.id),
    };
  }

  private async evaluateLogLevel(
    params: Record<string, any>,
    sourceId?: string,
  ): Promise<{ met: boolean; logIds: string[] }> {
    const { levels, timeWindowMinutes = 5 } = params;
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

    const levelsStr = Array.isArray(levels) ? levels.join(',') : levels;

    const { data: logs } = await this.logsService.findAll({
      sourceId,
      levels: levelsStr,
      startTime: since.toISOString(),
      limit: 100,
    });

    return {
      met: logs.length > 0,
      logIds: logs.map(l => l.id),
    };
  }

  private async evaluateKeywordMatch(
    params: Record<string, any>,
    sourceId?: string,
  ): Promise<{ met: boolean; logIds: string[] }> {
    const { keywords, matchAll = false, timeWindowMinutes = 5 } = params;
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

    const matchedLogIds: Set<string> = new Set();
    const keywordsMatched: Set<string> = new Set();

    for (const keyword of keywords) {
      const { data: logs } = await this.logsService.findAll({
        sourceId,
        search: keyword,
        startTime: since.toISOString(),
        limit: 50,
      });

      if (logs.length > 0) {
        keywordsMatched.add(keyword);
        logs.forEach(l => matchedLogIds.add(l.id));
      }
    }

    const met = matchAll
      ? keywordsMatched.size === keywords.length
      : keywordsMatched.size > 0;

    return {
      met,
      logIds: Array.from(matchedLogIds),
    };
  }

  private async evaluateNoLogs(
    params: Record<string, any>,
    sourceId?: string,
  ): Promise<{ met: boolean; logIds: string[] }> {
    const { timeWindowMinutes = 10 } = params;
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

    const { total } = await this.logsService.findAll({
      sourceId,
      startTime: since.toISOString(),
      limit: 1,
    });

    return {
      met: total === 0,
      logIds: [],
    };
  }

  /**
   * Trigger an alert from a rule
   */
  private async triggerAlert(rule: AlertRule, result: RuleEvaluationResult): Promise<Alert> {
    // Create alert
    const alert = this.alertsRepository.create({
      ruleId: rule.id,
      sourceId: rule.sourceId,
      logIds: result.matchedLogs,
      title: `Rule Triggered: ${rule.name}`,
      description: rule.description || result.reason || 'Alert rule conditions were met',
      severity: rule.severity,
      status: AlertStatus.ACTIVE,
      metadata: {
        ruleName: rule.name,
        triggerReason: result.reason,
        matchedLogCount: result.matchedLogs.length,
      },
    });

    const savedAlert = await this.alertsRepository.save(alert);

    // Update rule stats
    await this.rulesRepository.update(rule.id, {
      lastTriggeredAt: new Date(),
      triggerCount: () => 'triggerCount + 1',
    });

    // Emit anomaly.detected event instead of direct notification
    this.eventEmitter.emit('anomaly.detected', {
      rule,
      alert: savedAlert,
      message: savedAlert.description,
      priority: rule.severity,
      log: { id: result.matchedLogs[0], remoteServerId: rule.sourceId } // Pass first matched log for context
    });

    this.logger.log(`Alert triggered: ${savedAlert.id} from rule ${rule.name}. Emitted anomaly.detected event.`);

    return savedAlert;
  }

  /**
   * Manually trigger a rule for testing
   */
  async testRule(ruleId: string): Promise<RuleEvaluationResult> {
    const rule = await this.rulesRepository.findOne({ where: { id: ruleId } });
    if (!rule) {
      throw new Error('Rule not found');
    }

    return this.evaluateRule(rule);
  }
}
