import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('AI Logger API')
    .setDescription(`
## AI-Powered Log Analysis System

A production-grade logging system with AI-powered analysis for:
- **Log Ingestion**: Collect and store logs from multiple sources
- **AI Analysis**: Anomaly detection, pattern recognition, root cause analysis
- **Alerts**: Configurable alert rules with multi-channel notifications
- **Monitoring**: Real-time log monitoring and statistics

### AI Providers
- OpenAI (GPT-4) - Cloud-based, high quality
- Ollama - Local LLM, privacy-focused

### Authentication
All endpoints require JWT authentication. Register a user and login to get a token.
    `)
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('logs', 'Log ingestion and querying')
    .addTag('ai', 'AI-powered log analysis')
    .addTag('alerts', 'Alert rules and notifications')
    .addTag('log-sources', 'Log source configuration')
    .addTag('remote-servers', 'Remote server management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = Number(process.env.PORT ?? 8051);

  // Increase HTTP timeout for AI analysis endpoints (Ollama can take minutes)
  const httpServer = app.getHttpServer();
  httpServer.setTimeout(10 * 60 * 1000); // 10 minutes
  httpServer.keepAliveTimeout = 10 * 60 * 1000;
  httpServer.headersTimeout = 10 * 60 * 1000 + 1000;

  await app.listen(port);
  console.log(`🚀 Application running on: http://localhost:${port}`);
  console.log(`📚 Swagger API docs: http://localhost:${port}/api`);
}

bootstrap();

