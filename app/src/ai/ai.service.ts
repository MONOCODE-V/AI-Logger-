import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AIProvider,
  LogAnalysisResult,
  SingleLogAnalysis,
  LogSummary,
  RootCauseResult,
} from './interfaces/ai-provider.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { AnalysisResult } from './entities/analysis-result.entity';
import { Log } from '../logs/entities/log.entity';
import { LogsService } from '../logs/logs.service';

export type AIProviderType = 'openai' | 'ollama' | 'auto';

@Injectable()
export class AIService implements OnModuleInit {
  private readonly logger = new Logger(AIService.name);
  private activeProvider: AIProvider;
  private providers: Map<string, AIProvider> = new Map();
  private preferredProvider: AIProviderType;

  constructor(
    private readonly configService: ConfigService,
    private readonly openaiProvider: OpenAIProvider,
    private readonly ollamaProvider: OllamaProvider,
    private readonly logsService: LogsService,
    @InjectRepository(AnalysisResult)
    private readonly analysisRepository: Repository<AnalysisResult>,
  ) {
    this.preferredProvider = this.configService.get<AIProviderType>('AI_PROVIDER', 'auto');
    
    this.providers.set('openai', this.openaiProvider);
    this.providers.set('ollama', this.ollamaProvider);
  }

  async onModuleInit() {
    await this.selectProvider();
    this.logger.log(`AI Service initialized with provider: ${this.activeProvider?.name || 'none'}`);
  }

  /**
   * Select the best available provider based on configuration
   */
  private async selectProvider(): Promise<void> {
    if (this.preferredProvider !== 'auto') {
      const provider = this.providers.get(this.preferredProvider);
      if (provider && provider.isAvailable) {
        this.activeProvider = provider;
        return;
      }
      this.logger.warn(`Preferred provider ${this.preferredProvider} not available, falling back to auto`);
    }

    // Auto-select: prefer OpenAI, fallback to Ollama
    if (this.openaiProvider.isAvailable) {
      this.activeProvider = this.openaiProvider;
    } else if (await this.ollamaProvider.healthCheck()) {
      this.activeProvider = this.ollamaProvider;
    } else {
      this.logger.warn('No AI provider available');
    }
  }

  /**
   * Get current provider status
   */
  async getProviderStatus(): Promise<{
    active: string | null;
    providers: Array<{ name: string; available: boolean }>;
  }> {
    const status: Array<{ name: string; available: boolean }> = [];
    
    for (const [name, provider] of this.providers) {
      status.push({
        name,
        available: name === 'ollama' ? await provider.healthCheck() : provider.isAvailable,
      });
    }

    return {
      active: this.activeProvider?.name || null,
      providers: status,
    };
  }

  /**
   * Switch to a specific provider
   */
  async switchProvider(providerName: AIProviderType): Promise<boolean> {
    if (providerName === 'auto') {
      await this.selectProvider();
      return !!this.activeProvider;
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    const isAvailable = await provider.healthCheck();
    if (!isAvailable) {
      throw new Error(`Provider ${providerName} is not available`);
    }

    this.activeProvider = provider;
    this.logger.log(`Switched to provider: ${providerName}`);
    return true;
  }

  /**
   * Analyze a batch of logs
   */
  async analyzeBatch(sourceId?: string, limit: number = 100): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    // Fetch logs to analyze
    const { data: logs } = await this.logsService.findAll({
      sourceId,
      limit,
      sortOrder: 'DESC',
    });

    if (logs.length === 0) {
      return this.createEmptyResult('batch', sourceId);
    }

    let result: LogAnalysisResult;
    
    if (this.activeProvider) {
      result = await this.activeProvider.analyzeLogBatch(logs);
    } else {
      result = {
        anomalies: [],
        patterns: [],
        severity: 'unknown',
        summary: 'No AI provider available',
        recommendations: ['Configure an AI provider'],
        analyzedAt: new Date(),
        provider: 'none',
      };
    }

    // Save and return result
    const analysisResult = this.analysisRepository.create({
      analysisType: 'batch',
      sourceId,
      logIds: logs.map(l => l.id),
      provider: result.provider,
      severity: result.severity,
      summary: result.summary,
      anomalies: result.anomalies,
      patterns: result.patterns,
      recommendations: result.recommendations,
      tokensUsed: result.tokensUsed,
      durationMs: Date.now() - startTime,
    });

    const saved = await this.analysisRepository.save(analysisResult);

    // Mark logs as analyzed
    await this.logsService.markAsAnalyzed(logs.map(l => l.id));

    return saved;
  }

  /**
   * Analyze unanalyzed logs automatically
   */
  async analyzeUnanalyzed(limit: number = 100): Promise<AnalysisResult | null> {
    const logs = await this.logsService.getUnanalyzedLogs(limit);
    
    if (logs.length === 0) {
      return null;
    }

    const startTime = Date.now();
    let result: LogAnalysisResult;

    if (this.activeProvider) {
      result = await this.activeProvider.analyzeLogBatch(logs);
    } else {
      return null;
    }

    const analysisResult = this.analysisRepository.create({
      analysisType: 'batch',
      logIds: logs.map(l => l.id),
      provider: result.provider,
      severity: result.severity,
      summary: result.summary,
      anomalies: result.anomalies,
      patterns: result.patterns,
      recommendations: result.recommendations,
      durationMs: Date.now() - startTime,
    });

    const saved = await this.analysisRepository.save(analysisResult);
    await this.logsService.markAsAnalyzed(logs.map(l => l.id));

    return saved;
  }

  /**
   * Get summary of logs
   */
  async summarize(sourceId?: string, hours: number = 24): Promise<AnalysisResult> {
    const startTime = Date.now();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const { data: logs } = await this.logsService.findAll({
      sourceId,
      startTime: since.toISOString(),
      limit: 500,
    });

    if (!this.activeProvider || logs.length === 0) {
      return this.createEmptyResult('summary', sourceId);
    }

    const summary = await this.activeProvider.summarizeLogs(logs);

    const analysisResult = this.analysisRepository.create({
      analysisType: 'summary',
      sourceId,
      logIds: logs.map(l => l.id),
      provider: this.activeProvider.name,
      severity: summary.healthScore >= 80 ? 'healthy' : summary.healthScore >= 50 ? 'warning' : 'critical',
      summary: summary.summary,
      healthScore: summary.healthScore,
      recommendations: summary.topIssues,
      durationMs: Date.now() - startTime,
    });

    return this.analysisRepository.save(analysisResult);
  }

  /**
   * Perform root cause analysis on errors
   */
  async rootCauseAnalysis(errorLogIds: string[]): Promise<AnalysisResult> {
    const startTime = Date.now();

    // Fetch error logs
    const errorLogs: Log[] = [];
    for (const id of errorLogIds) {
      try {
        const log = await this.logsService.findOne(id);
        errorLogs.push(log);
      } catch {
        // Skip not found
      }
    }

    if (errorLogs.length === 0) {
      return this.createEmptyResult('rca');
    }

    // Get context logs (logs around the same time)
    const timestamps = errorLogs.map(l => new Date(l.timestamp).getTime());
    const minTime = new Date(Math.min(...timestamps) - 5 * 60 * 1000); // 5 min before
    const maxTime = new Date(Math.max(...timestamps) + 5 * 60 * 1000); // 5 min after

    const { data: contextLogs } = await this.logsService.findAll({
      startTime: minTime.toISOString(),
      endTime: maxTime.toISOString(),
      limit: 200,
    });

    if (!this.activeProvider) {
      return this.createEmptyResult('rca');
    }

    const rca = await this.activeProvider.rootCauseAnalysis(errorLogs, contextLogs);

    const analysisResult = this.analysisRepository.create({
      analysisType: 'rca',
      logIds: errorLogIds,
      provider: this.activeProvider.name,
      severity: rca.confidence >= 0.7 ? 'critical' : 'warning',
      summary: rca.probableCauses[0]?.cause || 'Root cause analysis completed',
      rootCauseAnalysis: {
        probableCauses: rca.probableCauses,
        affectedComponents: rca.affectedComponents,
        recommendedFixes: rca.recommendedFixes,
      },
      recommendations: rca.recommendedFixes,
      durationMs: Date.now() - startTime,
    });

    return this.analysisRepository.save(analysisResult);
  }

  /**
   * Get analysis history
   */
  async getAnalysisHistory(
    limit: number = 20,
    sourceId?: string,
    type?: string,
  ): Promise<AnalysisResult[]> {
    const where: any = {};
    if (sourceId) where.sourceId = sourceId;
    if (type) where.analysisType = type;

    return this.analysisRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get a specific analysis by ID
   */
  async getAnalysis(id: string): Promise<AnalysisResult | null> {
    return this.analysisRepository.findOne({ where: { id } });
  }

  private createEmptyResult(type: 'batch' | 'single' | 'summary' | 'rca', sourceId?: string): AnalysisResult {
    const result = new AnalysisResult();
    result.id = crypto.randomUUID();
    result.analysisType = type;
    result.sourceId = sourceId;
    result.logIds = [];
    result.provider = 'none';
    result.severity = 'unknown';
    result.summary = 'No data to analyze';
    result.createdAt = new Date();
    return result;
  }
}
