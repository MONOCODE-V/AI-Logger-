import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LogSourceStatus, LogSourceType } from '../entities/log-source.entity';

export class CreateLogSourceDto {
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsString()
  name: string;

  @IsEnum(LogSourceType)
  type: LogSourceType;

  @IsOptional()
  @IsEnum(LogSourceStatus)
  status?: LogSourceStatus;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  config?: Record<string, any>;
}
