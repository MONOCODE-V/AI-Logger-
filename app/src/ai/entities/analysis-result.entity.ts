import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

// Re-define types locally to avoid decorator metadata issues
export type AnalysisSeverity = 'healthy' | 'warning' | 'critical' | 'unknown';

export enum AnalysisAnomalyType {
  ERROR_SPIKE = 'error_spike',
  UNUSUAL_PATTERN = 'unusual_pattern',
  SECURITY_CONCERN = 'security_concern',
  PERFORMANCE_ISSUE = 'performance_issue',
  SYSTEM_FAILURE = 'system_failure',
  CONFIGURATION_ERROR = 'configuration_error',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  UNKNOWN = 'unknown',
}

@Entity('analysis_results')
@Index(['sourceId', 'createdAt'])
@Index(['analysisType', 'createdAt'])
export class AnalysisResult {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Type of analysis performed' })
  @Column()
  @Index()
  analysisType: 'batch' | 'single' | 'summary' | 'rca';

  @ApiProperty({ description: 'Source ID if analysis was for specific source' })
  @Column({ nullable: true })
  @Index()
  sourceId?: string;

  @ApiProperty({ description: 'IDs of logs that were analyzed' })
  @Column({ type: 'simple-json' })
  logIds: string[];

  @ApiProperty({ description: 'AI provider used' })
  @Column()
  provider: string;

  @ApiProperty({ description: 'Overall severity assessment' })
  @Column({
    type: 'simple-enum',
    enum: ['healthy', 'warning', 'critical', 'unknown'],
    default: 'unknown',
  })
  severity: AnalysisSeverity;

  @ApiProperty({ description: 'Analysis summary' })
  @Column('text')
  summary: string;

  @ApiProperty({ description: 'Detected anomalies' })
  @Column({ type: 'simple-json', nullable: true })
  anomalies?: Array<{
    logId: string;
    type: string;
    confidence: number;
    description: string;
    suggestedAction?: string;
  }>;

  @ApiProperty({ description: 'Detected patterns' })
  @Column({ type: 'simple-json', nullable: true })
  patterns?: Array<{
    pattern: string;
    occurrences: number;
    logIds: string[];
    significance: string;
    description: string;
  }>;

  @ApiProperty({ description: 'Recommendations from AI' })
  @Column({ type: 'simple-json', nullable: true })
  recommendations?: string[];

  @ApiProperty({ description: 'Root cause analysis results' })
  @Column({ type: 'simple-json', nullable: true })
  rootCauseAnalysis?: Record<string, any>;

  @ApiProperty({ description: 'Health score (0-100)' })
  @Column({ type: 'integer', nullable: true })
  healthScore?: number;

  @ApiProperty({ description: 'Tokens used for analysis' })
  @Column({ type: 'integer', nullable: true })
  tokensUsed?: number;

  @ApiProperty({ description: 'Duration of analysis in milliseconds' })
  @Column({ type: 'integer', nullable: true })
  durationMs?: number;

  @CreateDateColumn()
  createdAt: Date;
}
