import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { Alert } from './entities/alert.entity';
import { AlertRule } from './entities/alert-rule.entity';
import { RulesEngineService } from './services/rules-engine.service';
import { NotificationsService } from './services/notifications.service';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Alert, AlertRule]),
    LogsModule,
  ],
  controllers: [AlertsController],
  providers: [
    AlertsService,
    RulesEngineService,
    NotificationsService,
  ],
  exports: [AlertsService, RulesEngineService, NotificationsService],
})
export class AlertsModule {}
