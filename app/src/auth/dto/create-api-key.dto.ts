import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, MinLength, IsDateString } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production Ingestion Key', description: 'Friendly name for the key' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({
    example: ['ingest', 'read'],
    description: 'Permissions: ingest (send logs), read (query logs), admin (manage keys)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({
    example: '2027-02-23T10:30:00Z',
    description: 'Key expiration date (optional, null = never expires)',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
