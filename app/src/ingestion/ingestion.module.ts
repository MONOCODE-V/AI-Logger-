import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LogsModule } from '../logs/logs.module';
import { LogSourcesModule } from '../log-sources/log-sources.module';
import { RemoteServersModule } from '../remote-servers/remote-servers.module';
import { SyslogListenerService } from './syslog-listener.service';
import { ScheduledPullService } from './scheduled-pull.service';
import { IngestionController } from './ingestion.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    LogsModule,           // provides LogsService, LogParserService
    LogSourcesModule,     // provides LogSourcesService
    RemoteServersModule,  // provides RemoteServersService
  ],
  controllers: [IngestionController],
  providers: [SyslogListenerService, ScheduledPullService],
  exports: [SyslogListenerService, ScheduledPullService],
})
export class IngestionModule {}
