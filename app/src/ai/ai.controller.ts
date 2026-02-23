import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AIService, AIProviderType } from './ai.service';
import { AnalysisResult } from './entities/analysis-result.entity';

class AnalyzeBatchDto {
  sourceId?: string;
  limit?: number;
}

class RootCauseDto {
  errorLogIds: string[];
}

class SwitchProviderDto {
  provider: AIProviderType;
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get AI provider status' })
  @ApiResponse({ status: 200, description: 'Provider status information' })
  getStatus() {
    return this.aiService.getProviderStatus();
  }

  @Post('switch-provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch AI provider' })
  @ApiResponse({ status: 200, description: 'Provider switched successfully' })
  async switchProvider(@Body() dto: SwitchProviderDto) {
    await this.aiService.switchProvider(dto.provider);
    return this.aiService.getProviderStatus();
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze a batch of logs' })
  @ApiResponse({ status: 201, description: 'Analysis completed', type: AnalysisResult })
  analyze(@Body() dto: AnalyzeBatchDto): Promise<AnalysisResult> {
    return this.aiService.analyzeBatch(dto.sourceId, dto.limit || 100);
  }

  @Post('analyze/unanalyzed')
  @ApiOperation({ summary: 'Analyze unanalyzed logs' })
  @ApiResponse({ status: 201, description: 'Analysis completed or null if no logs' })
  analyzeUnanalyzed(@Query('limit') limit?: number): Promise<AnalysisResult | null> {
    return this.aiService.analyzeUnanalyzed(limit || 100);
  }

  @Post('summarize')
  @ApiOperation({ summary: 'Get AI summary of logs' })
  @ApiQuery({ name: 'sourceId', required: false })
  @ApiQuery({ name: 'hours', required: false, type: Number })
  @ApiResponse({ status: 201, description: 'Summary generated', type: AnalysisResult })
  summarize(
    @Query('sourceId') sourceId?: string,
    @Query('hours') hours?: number,
  ): Promise<AnalysisResult> {
    return this.aiService.summarize(sourceId, hours || 24);
  }

  @Post('root-cause')
  @ApiOperation({ summary: 'Perform root cause analysis on error logs' })
  @ApiResponse({ status: 201, description: 'RCA completed', type: AnalysisResult })
  rootCauseAnalysis(@Body() dto: RootCauseDto): Promise<AnalysisResult> {
    return this.aiService.rootCauseAnalysis(dto.errorLogIds);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get analysis history' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sourceId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiResponse({ status: 200, description: 'Analysis history', type: [AnalysisResult] })
  getHistory(
    @Query('limit') limit?: number,
    @Query('sourceId') sourceId?: string,
    @Query('type') type?: string,
  ): Promise<AnalysisResult[]> {
    return this.aiService.getAnalysisHistory(limit || 20, sourceId, type);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific analysis result' })
  @ApiResponse({ status: 200, description: 'Analysis result', type: AnalysisResult })
  getAnalysis(@Param('id') id: string): Promise<AnalysisResult | null> {
    return this.aiService.getAnalysis(id);
  }
}
