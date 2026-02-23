import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RemoteServerStatus } from '../entities/remote-server.entity';

export class CreateRemoteServerDto {
  @IsString()
  name: string;

  @IsString()
  url: string;

  @IsString()
  ownerId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  config?: Record<string, any>;

  @IsOptional()
  @IsEnum(RemoteServerStatus)
  status?: RemoteServerStatus;
}
