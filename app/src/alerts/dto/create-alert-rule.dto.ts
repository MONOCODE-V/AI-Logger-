import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AlertSeverity } from '../entities/alert.entity';
import { RuleConditionType, RuleStatus } from '../entities/alert-rule.entity';

export class RuleConditionDto {
  @ApiProperty({ enum: RuleConditionType })
  @IsEnum(RuleConditionType)
  type: RuleConditionType;

  @ApiProperty({ example: { threshold: 10, timeWindowMinutes: 5 } })
  @IsObject()
  params: Record<string, any>;
}

export class RuleActionDto {
  @ApiProperty({ enum: ['email', 'webhook', 'slack', 'in_app'] })
  @IsString()
  type: 'email' | 'webhook' | 'slack' | 'in_app';

  @ApiProperty({ example: { email: 'admin@example.com' } })
  @IsObject()
  config: Record<string, any>;
}

export class CreateAlertRuleDto {
  @ApiProperty({ example: 'High Error Rate Alert' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Triggers when error rate exceeds 50%' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Limit to specific source' })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({ enum: RuleStatus, default: RuleStatus.ENABLED })
  @IsOptional()
  @IsEnum(RuleStatus)
  status?: RuleStatus;

  @ApiProperty({ enum: AlertSeverity })
  @IsEnum(AlertSeverity)
  severity: AlertSeverity;

  @ApiProperty({ type: [RuleConditionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions: RuleConditionDto[];

  @ApiProperty({ type: [RuleActionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  actions: RuleActionDto[];

  @ApiPropertyOptional({ example: 5, default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  cooldownMinutes?: number;
}
