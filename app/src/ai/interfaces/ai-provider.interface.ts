import { Log } from '../../logs/entities/log.entity';

/**
 * AI Provider Interface - Abstract base for all AI providers.
 * This allows swapping between OpenAI, Ollama, or any other LLM provider.
 */
export interface AIProvider {
  readonly name: string;
  readonly isAvailable: boolean;

  /**
   * Analyze a batch of logs and detect anomalies
   */
  analyzeLogBatch(logs: Log[]): Promise<LogAnalysisResult>;

  /**
   * Analyze a single log entry for potential issues
   */
  analyzeLog(log: Log): Promise<SingleLogAnalysis>;

  /**
   * Summarize a collection of logs
   */
  summarizeLogs(logs: Log[]): Promise<LogSummary>;

  /**
   * Perform root cause analysis given error logs
   */
  rootCauseAnalysis(errorLogs: Log[], contextLogs: Log[]): Promise<RootCauseResult>;

  /**
   * Check if the provider is properly configured and working
   */
  healthCheck(): Promise<boolean>;
}

export interface LogAnalysisResult {
  anomalies: AnomalyDetection[];
  patterns: PatternDetection[];
  severity: OverallSeverity;
  summary: string;
  recommendations: string[];
  analyzedAt: Date;
  provider: string;
  tokensUsed?: number;
}

export interface AnomalyDetection {
  logId: string;
  type: AnomalyType;
  confidence: number; // 0-1
  description: string;
  suggestedAction?: string;
}

export enum AnomalyType {
  ERROR_SPIKE = 'error_spike',
  UNUSUAL_PATTERN = 'unusual_pattern',
  SECURITY_CONCERN = 'security_concern',
  PERFORMANCE_ISSUE = 'performance_issue',
  SYSTEM_FAILURE = 'system_failure',
  CONFIGURATION_ERROR = 'configuration_error',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  UNKNOWN = 'unknown',
}

export interface PatternDetection {
  pattern: string;
  occurrences: number;
  logIds: string[];
  significance: 'low' | 'medium' | 'high';
  description: string;
}

export interface SingleLogAnalysis {
  logId: string;
  isAnomaly: boolean;
  anomalyType?: AnomalyType;
  confidence: number;
  explanation: string;
  suggestedActions: string[];
  relatedConcepts: string[];
}

export interface LogSummary {
  totalLogs: number;
  timeRange: { start: Date; end: Date };
  summary: string;
  keyEvents: string[];
  levelDistribution: Record<string, number>;
  topIssues: string[];
  healthScore: number; // 0-100
}

export interface RootCauseResult {
  probableCauses: ProbableCause[];
  timeline: TimelineEvent[];
  affectedComponents: string[];
  recommendedFixes: string[];
  confidence: number;
  analysisDepth: 'shallow' | 'deep';
}

export interface ProbableCause {
  cause: string;
  probability: number; // 0-1
  evidence: string[];
  logIds: string[];
}

export interface TimelineEvent {
  timestamp: Date;
  event: string;
  logId: string;
  significance: 'trigger' | 'symptom' | 'result';
}

export type OverallSeverity = 'healthy' | 'warning' | 'critical' | 'unknown';

/**
 * Configuration for AI providers
 */
export interface AIProviderConfig {
  provider: 'openai' | 'ollama' | 'auto';
  openai?: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  ollama?: {
    baseUrl: string;
    model: string;
  };
}
