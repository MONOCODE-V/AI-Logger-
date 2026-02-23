import { Controller, Post, Body, Get, Delete, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRegisterDto } from './dto/auth-register.dto';
import { AuthLoginDto } from './dto/auth-login.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import type { CurrentUser as CurrentUserDto } from './interfaces/current-user.interface';
import { Public } from './decorators/public.decorator';
import { ApiKeyService } from './services/api-key.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() registerDto: AuthRegisterDto) {
    return this.authService.register(
      registerDto.email,
      registerDto.username,
      registerDto.password,
    );
  }

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() loginDto: AuthLoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile (requires JWT)' })
  async getProfile(@CurrentUser() user: CurrentUserDto) {
    return this.authService.validateUser(user.id);
  }

  // ─── API Key Management ───────────────────────────────────────────

  @Post('api-keys')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create an API key for machine-to-machine auth (log ingestion)',
    description:
      'Creates a new API key. The raw key is returned ONCE in the response — store it securely. ' +
      'Use the key in the X-API-Key header when sending logs.',
  })
  @ApiResponse({
    status: 201,
    description:
      'API key created. The rawKey field contains the key — this is the ONLY time it will be shown.',
  })
  async createApiKey(
    @CurrentUser() user: CurrentUserDto,
    @Body() dto: CreateApiKeyDto,
  ) {
    const { apiKey, rawKey } = await this.apiKeyService.create(user.id, dto);
    return {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      permissions: apiKey.permissions,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      rawKey, // ⚠️ Only shown once!
      usage: {
        header: 'X-API-Key',
        example: `curl -H "X-API-Key: ${rawKey}" -X POST http://localhost:8051/logs/ingest ...`,
      },
    };
  }

  @Get('api-keys')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List your API keys (key values are hidden)' })
  async listApiKeys(@CurrentUser() user: CurrentUserDto) {
    return this.apiKeyService.findAllByOwner(user.id);
  }

  @Delete('api-keys/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke (deactivate) an API key' })
  async revokeApiKey(
    @CurrentUser() user: CurrentUserDto,
    @Param('id') id: string,
  ) {
    return this.apiKeyService.revoke(id, user.id);
  }
}
