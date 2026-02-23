import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  SILENCED = 'silenced',
}

@Entity('alerts')
@Index(['status', 'createdAt'])
@Index(['severity', 'status'])
@Index(['sourceId', 'createdAt'])
export class Alert {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Alert rule that triggered this' })
  @Column({ nullable: true })
  @Index()
  ruleId?: string;

  @ApiProperty({ description: 'Source that generated this alert' })
  @Column({ nullable: true })
  @Index()
  sourceId?: string;

  @ApiProperty({ description: 'Associated log IDs' })
  @Column({ type: 'simple-json', nullable: true })
  logIds?: string[];

  @ApiProperty({ description: 'Analysis result ID if triggered by AI' })
  @Column({ nullable: true })
  analysisId?: string;

  @ApiProperty({ example: 'High error rate detected' })
  @Column()
  title: string;

  @ApiProperty({ example: 'Error rate exceeded 50% in the last 5 minutes' })
  @Column('text')
  description: string;

  @ApiProperty({ enum: AlertSeverity })
  @Column({
    type: 'simple-enum',
    enum: AlertSeverity,
    default: AlertSeverity.MEDIUM,
  })
  @Index()
  severity: AlertSeverity;

  @ApiProperty({ enum: AlertStatus })
  @Column({
    type: 'simple-enum',
    enum: AlertStatus,
    default: AlertStatus.ACTIVE,
  })
  @Index()
  status: AlertStatus;

  @ApiProperty({ description: 'Additional context data' })
  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, any>;

  @ApiProperty({ description: 'User who acknowledged/resolved' })
  @Column({ nullable: true })
  acknowledgedBy?: string;

  @ApiProperty({ description: 'Resolution notes' })
  @Column('text', { nullable: true })
  resolutionNotes?: string;

  @ApiProperty()
  @Column({ nullable: true })
  acknowledgedAt?: Date;

  @ApiProperty()
  @Column({ nullable: true })
  resolvedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
