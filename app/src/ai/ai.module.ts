import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { OpenAIProvider } from './providers/openai.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { AnalysisResult } from './entities/analysis-result.entity';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([AnalysisResult]),
    LogsModule,
  ],
  controllers: [AIController],
  providers: [
    AIService,
    OpenAIProvider,
    OllamaProvider,
  ],
  exports: [AIService],
})
export class AIModule {}
