import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  LogAnalysisResult,
  SingleLogAnalysis,
  LogSummary,
  RootCauseResult,
  OverallSeverity,
} from '../interfaces/ai-provider.interface';
import { Log } from '../../logs/entities/log.entity';

/**
 * Ollama Provider - Uses local Ollama LLM for log analysis.
 * Privacy-focused, runs completely locally.
 * Requires OLLAMA_BASE_URL environment variable (default: http://localhost:11434)
 */
@Injectable()
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private readonly logger = new Logger(OllamaProvider.name);
  private baseUrl: string;
  private model: string;
  private _isAvailable: boolean = false;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.model = this.configService.get<string>('OLLAMA_MODEL', 'llama3.2');
    this.checkAvailability();
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      this._isAvailable = response.ok;
    } catch {
      this._isAvailable = false;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return false;
      
      const data = await response.json();
      const hasModel = data.models?.some((m: any) => m.name.includes(this.model));
      this._isAvailable = hasModel;
      return hasModel;
    } catch (error) {
      this.logger.error('Ollama health check failed', error);
      this._isAvailable = false;
      return false;
    }
  }

  async analyzeLogBatch(logs: Log[]): Promise<LogAnalysisResult> {
    if (!this._isAvailable) {
      return this.getUnavailableResult();
    }

    const logsContext = this.formatLogsForAnalysis(logs);
    
    const prompt = `You are an expert log analyzer. Analyze these logs and identify anomalies, patterns, and provide recommendations.

Logs:
${logsContext}

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "anomalies": [{ "logId": "id", "type": "error_spike", "confidence": 0.8, "description": "...", "suggestedAction": "..." }],
  "patterns": [{ "pattern": "...", "occurrences": 3, "logIds": ["id1"], "significance": "medium", "description": "..." }],
  "severity": "warning",
  "summary": "Brief summary",
  "recommendations": ["action1"]
}`;

    try {
      const response = await this.callOllama(prompt);
      const parsed = this.parseJsonResponse(response);
      
      return {
        anomalies: parsed.anomalies || [],
        patterns: parsed.patterns || [],
        severity: parsed.severity || 'unknown',
        summary: parsed.summary || 'Analysis completed',
        recommendations: parsed.recommendations || [],
        analyzedAt: new Date(),
        provider: this.name,
      };
    } catch (error) {
      this.logger.error('Failed to analyze log batch', error);
      return this.getErrorResult(error);
    }
  }

  async analyzeLog(log: Log): Promise<SingleLogAnalysis> {
    if (!this._isAvailable) {
      return {
        logId: log.id,
        isAnomaly: false,
        confidence: 0,
        explanation: 'Ollama provider not available',
        suggestedActions: [],
        relatedConcepts: [],
      };
    }

    const prompt = `Analyze this log entry for issues:
Level: ${log.level}
Message: ${log.message}
Metadata: ${JSON.stringify(log.metadata || {})}

Respond ONLY with JSON:
{
  "isAnomaly": false,
  "confidence": 0.5,
  "explanation": "...",
  "suggestedActions": [],
  "relatedConcepts": []
}`;

    try {
      const response = await this.callOllama(prompt);
      const parsed = this.parseJsonResponse(response);
      
      return {
        logId: log.id,
        isAnomaly: parsed.isAnomaly || false,
        anomalyType: parsed.anomalyType,
        confidence: parsed.confidence || 0,
        explanation: parsed.explanation || '',
        suggestedActions: parsed.suggestedActions || [],
        relatedConcepts: parsed.relatedConcepts || [],
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
    if (!this._isAvailable || logs.length === 0) {
      return this.getEmptySummary(logs);
    }

    const levelDist = this.calculateLevelDistribution(logs);
    const timeRange = this.getTimeRange(logs);
    const logsContext = this.formatLogsForAnalysis(logs.slice(0, 50));

    const prompt = `Summarize these logs:
Total: ${logs.length}
Time: ${timeRange.start?.toISOString()} to ${timeRange.end?.toISOString()}
Levels: ${JSON.stringify(levelDist)}

Sample:
${logsContext}

Respond ONLY with JSON:
{
  "summary": "...",
  "keyEvents": ["event1"],
  "topIssues": ["issue1"],
  "healthScore": 85
}`;

    try {
      const response = await this.callOllama(prompt);
      const parsed = this.parseJsonResponse(response);
      
      return {
        totalLogs: logs.length,
        timeRange,
        levelDistribution: levelDist,
        summary: parsed.summary || '',
        keyEvents: parsed.keyEvents || [],
        topIssues: parsed.topIssues || [],
        healthScore: parsed.healthScore || 100,
      };
    } catch (error) {
      this.logger.error('Failed to summarize logs', error);
      return this.getEmptySummary(logs);
    }
  }

  async rootCauseAnalysis(errorLogs: Log[], contextLogs: Log[]): Promise<RootCauseResult> {
    if (!this._isAvailable || errorLogs.length === 0) {
      return {
        probableCauses: [],
        timeline: [],
        affectedComponents: [],
        recommendedFixes: [],
        confidence: 0,
        analysisDepth: 'shallow',
      };
    }

    const errorContext = this.formatLogsForAnalysis(errorLogs.slice(0, 20));
    const context = this.formatLogsForAnalysis(contextLogs.slice(0, 30));

    const prompt = `Root cause analysis for errors:

ERRORS:
${errorContext}

CONTEXT:
${context}

Respond ONLY with JSON:
{
  "probableCauses": [{ "cause": "...", "probability": 0.8, "evidence": ["..."], "logIds": [] }],
  "affectedComponents": ["component1"],
  "recommendedFixes": ["fix1"],
  "confidence": 0.7,
  "analysisDepth": "deep"
}`;

    try {
      const response = await this.callOllama(prompt);
      const parsed = this.parseJsonResponse(response);
      
      return {
        probableCauses: parsed.probableCauses || [],
        timeline: [],
        affectedComponents: parsed.affectedComponents || [],
        recommendedFixes: parsed.recommendedFixes || [],
        confidence: parsed.confidence || 0,
        analysisDepth: parsed.analysisDepth || 'shallow',
      };
    } catch (error) {
      this.logger.error('Failed RCA', error);
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

  private async callOllama(prompt: string): Promise<string> {
    // 5-minute timeout for LLM generation
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 2048,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseJsonResponse(response: string): any {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No valid JSON found in response');
  }

  private formatLogsForAnalysis(logs: Log[]): string {
    return logs
      .map(log => {
        const msg = log.message?.length > 200 ? log.message.substring(0, 200) + '...' : (log.message || '');
        return `[${log.level.toUpperCase()}] ${log.id}: ${msg}`;
      })
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
      summary: 'Ollama is not available. Ensure Ollama is running at ' + this.baseUrl,
      recommendations: ['Install and start Ollama', `Pull model: ollama pull ${this.model}`],
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
