import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogSourcesService } from './log-sources.service';
import { LogSourcesController } from './log-sources.controller';
import { LogSource } from './entities/log-source.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LogSource])],
  controllers: [LogSourcesController],
  providers: [LogSourcesService],
  exports: [LogSourcesService],
})
export class LogSourcesModule {}
