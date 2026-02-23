import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  LogAnalysisResult,
  SingleLogAnalysis,
  LogSummary,
  RootCauseResult,
  AnomalyType,
  OverallSeverity,
} from '../interfaces/ai-provider.interface';
import { Log, LogLevel } from '../../logs/entities/log.entity';

/**
 * OpenAI Provider - Uses OpenAI's GPT models for log analysis.
 * Requires OPENAI_API_KEY environment variable.
 */
@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    this.maxTokens = this.configService.get<number>('OPENAI_MAX_TOKENS', 2000);
    this.temperature = this.configService.get<number>('OPENAI_TEMPERATURE', 0.3);
  }

  get isAvailable(): boolean {
    return !!this.apiKey;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch (error) {
      this.logger.error('OpenAI health check failed', error);
      return false;
    }
  }

  async analyzeLogBatch(logs: Log[]): Promise<LogAnalysisResult> {
    if (!this.isAvailable) {
      return this.getUnavailableResult();
    }

    const logsContext = this.formatLogsForAnalysis(logs);
    
    const prompt = `You are an expert log analyzer for production systems. Analyze these logs and identify:
1. Anomalies (unusual patterns, errors, security concerns)
2. Recurring patterns
3. Overall system health
4. Actionable recommendations

Logs:
${logsContext}

Respond in JSON format:
{
  "anomalies": [{ "logId": "id", "type": "error_spike|unusual_pattern|security_concern|performance_issue|system_failure|configuration_error|resource_exhaustion", "confidence": 0.0-1.0, "description": "...", "suggestedAction": "..." }],
  "patterns": [{ "pattern": "...", "occurrences": N, "logIds": ["id1", "id2"], "significance": "low|medium|high", "description": "..." }],
  "severity": "healthy|warning|critical",
  "summary": "Brief overall summary",
  "recommendations": ["action1", "action2"]
}`;

    try {
      const response = await this.callOpenAI(prompt);
      const parsed = JSON.parse(response);
      
      return {
        ...parsed,
        analyzedAt: new Date(),
        provider: this.name,
      };
    } catch (error) {
      this.logger.error('Failed to analyze log batch', error);
      return this.getErrorResult(error);
    }
  }

  async analyzeLog(log: Log): Promise<SingleLogAnalysis> {
    if (!this.isAvailable) {
      return {
        logId: log.id,
        isAnomaly: false,
        confidence: 0,
        explanation: 'AI provider not available',
        suggestedActions: [],
        relatedConcepts: [],
      };
    }

    const prompt = `Analyze this single log entry for potential issues:
Log ID: ${log.id}
Level: ${log.level}
Message: ${log.message}
Timestamp: ${log.timestamp}
Metadata: ${JSON.stringify(log.metadata || {})}

Respond in JSON:
{
  "isAnomaly": boolean,
  "anomalyType": "error_spike|unusual_pattern|security_concern|performance_issue|system_failure|configuration_error|resource_exhaustion|null",
  "confidence": 0.0-1.0,
  "explanation": "...",
  "suggestedActions": ["..."],
  "relatedConcepts": ["..."]
}`;

    try {
      const response = await this.callOpenAI(prompt);
      const parsed = JSON.parse(response);
      
      return {
        logId: log.id,
        ...parsed,
      };
    } catch (error) {
      this.logger.error('Failed to analyze single log', error);
      return {
        logId: log.id,
        isAnomaly: false,
        confidence: 0,
        explanation: 'Analysis failed',
        suggestedActions: [],
        relatedConcepts: [],
      };
    }
  }

  async summarizeLogs(logs: Log[]): Promise<LogSummary> {
    if (!this.isAvailable || logs.length === 0) {
      return this.getEmptySummary(logs);
    }

    const logsContext = this.formatLogsForAnalysis(logs);
    const levelDist = this.calculateLevelDistribution(logs);
    const timeRange = this.getTimeRange(logs);

    const prompt = `Summarize these production logs and assess system health:

Time Range: ${timeRange.start?.toISOString()} to ${timeRange.end?.toISOString()}
Total Logs: ${logs.length}
Level Distribution: ${JSON.stringify(levelDist)}

Logs Sample:
${logsContext}

Respond in JSON:
{
  "summary": "Comprehensive summary of what happened",
  "keyEvents": ["Event 1", "Event 2"],
  "topIssues": ["Issue 1", "Issue 2"],
  "healthScore": 0-100
}`;

    try {
      const response = await this.callOpenAI(prompt);
      const parsed = JSON.parse(response);
      
      return {
        totalLogs: logs.length,
        timeRange,
        levelDistribution: levelDist,
        ...parsed,
      };
    } catch (error) {
      this.logger.error('Failed to summarize logs', error);
      return this.getEmptySummary(logs);
    }
  }

  async rootCauseAnalysis(errorLogs: Log[], contextLogs: Log[]): Promise<RootCauseResult> {
    if (!this.isAvailable || errorLogs.length === 0) {
      return {
        probableCauses: [],
        timeline: [],
        affectedComponents: [],
        recommendedFixes: [],
        confidence: 0,
        analysisDepth: 'shallow',
      };
    }

    const errorContext = this.formatLogsForAnalysis(errorLogs);
    const context = this.formatLogsForAnalysis(contextLogs.slice(0, 50));

    const prompt = `Perform root cause analysis on these error logs:

ERROR LOGS:
${errorContext}

CONTEXT LOGS (before/around errors):
${context}

Analyze and respond in JSON:
{
  "probableCauses": [{ "cause": "...", "probability": 0.0-1.0, "evidence": ["..."], "logIds": ["..."] }],
  "timeline": [{ "timestamp": "ISO date", "event": "...", "logId": "...", "significance": "trigger|symptom|result" }],
  "affectedComponents": ["component1", "component2"],
  "recommendedFixes": ["fix1", "fix2"],
  "confidence": 0.0-1.0,
  "analysisDepth": "deep"
}`;

    try {
      const response = await this.callOpenAI(prompt);
      const parsed = JSON.parse(response);
      
      // Convert timestamp strings to Date objects
      if (parsed.timeline) {
        parsed.timeline = parsed.timeline.map((t: any) => ({
          ...t,
          timestamp: new Date(t.timestamp),
        }));
      }
      
      return parsed;
    } catch (error) {
      this.logger.error('Failed to perform root cause analysis', error);
      return {
        probableCauses: [],
        timeline: [],
        affectedComponents: [],
        recommendedFixes: [],
        confidence: 0,
        analysisDepth: 'shallow',
      };
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert log analyzer. Always respond with valid JSON only, no markdown.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private formatLogsForAnalysis(logs: Log[]): string {
    return logs
      .slice(0, 100) // Limit to prevent token overflow
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.id}: ${log.message}`)
      .join('\n');
  }

  private calculateLevelDistribution(logs: Log[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const log of logs) {
      dist[log.level] = (dist[log.level] || 0) + 1;
    }
    return dist;
  }

  private getTimeRange(logs: Log[]): { start: Date; end: Date } {
    if (logs.length === 0) {
      return { start: new Date(), end: new Date() };
    }
    const timestamps = logs.map(l => new Date(l.timestamp).getTime());
    return {
      start: new Date(Math.min(...timestamps)),
      end: new Date(Math.max(...timestamps)),
    };
  }

  private getUnavailableResult(): LogAnalysisResult {
    return {
      anomalies: [],
      patterns: [],
      severity: 'unknown' as OverallSeverity,
      summary: 'OpenAI provider is not configured. Set OPENAI_API_KEY environment variable.',
      recommendations: ['Configure OpenAI API key to enable AI analysis'],
      analyzedAt: new Date(),
      provider: this.name,
    };
  }

  private getErrorResult(error: any): LogAnalysisResult {
    return {
      anomalies: [],
      patterns: [],
      severity: 'unknown' as OverallSeverity,
      summary: `Analysis failed: ${error.message}`,
      recommendations: [],
      analyzedAt: new Date(),
      provider: this.name,
    };
  }

  private getEmptySummary(logs: Log[]): LogSummary {
    return {
      totalLogs: logs.length,
      timeRange: this.getTimeRange(logs),
      summary: 'No analysis available',
      keyEvents: [],
      levelDistribution: this.calculateLevelDistribution(logs),
      topIssues: [],
      healthScore: 100,
    };
  }
}
