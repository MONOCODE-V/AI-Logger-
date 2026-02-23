import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AlertSeverity, AlertStatus } from '../entities/alert.entity';

export class CreateAlertDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ruleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  analysisId?: string;

  @ApiProperty({ example: 'High error rate detected' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Error rate exceeded 50%' })
  @IsString()
  description: string;

  @ApiProperty({ enum: AlertSeverity })
  @IsEnum(AlertSeverity)
  severity: AlertSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  logIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class AcknowledgeAlertDto {
  @ApiPropertyOptional({ example: 'Looking into it' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ResolveAlertDto {
  @ApiProperty({ example: 'Fixed by restarting the service' })
  @IsString()
  notes: string;
}

export class QueryAlertsDto {
  @ApiPropertyOptional({ enum: AlertStatus })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @ApiPropertyOptional({ enum: AlertSeverity })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;
}
