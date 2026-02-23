import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtGuard } from './auth/guards/jwt.guard';
import { ApiKeyGuard } from './auth/guards/api-key.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RemoteServersModule } from './remote-servers/remote-servers.module';
import { LogSourcesModule } from './log-sources/log-sources.module';
import { LogsModule } from './logs/logs.module';
import { AIModule } from './ai/ai.module';
import { AlertsModule } from './alerts/alerts.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TicketsModule } from './tickets/tickets.module';
import { IngestionModule } from './ingestion/ingestion.module';

const dbAutoLoadEntities = (process.env.DB_AUTO_LOAD_ENTITIES ?? 'true') === 'true';
const dbSynchronize = (process.env.DB_SYNCHRONIZE ?? 'true') === 'true';
const dbLocation = process.env.DB_LOCATION ?? 'database.sqlite';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    UsersModule,
    AuthModule,
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: dbLocation,
      autoLoadEntities: dbAutoLoadEntities,
      synchronize: dbSynchronize,
    }),
    RemoteServersModule,
    LogSourcesModule,
    LogsModule,
    AIModule,
    AlertsModule,
    TicketsModule,
    IngestionModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ApiKeyGuard runs FIRST — checks X-API-Key header and marks request if valid
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    // JwtGuard runs SECOND — skips if already API-key authenticated
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
  ],
})
export class AppModule {}
