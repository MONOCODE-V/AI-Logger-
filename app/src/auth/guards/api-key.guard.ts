import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeyService } from '../services/api-key.service';

/**
 * Guard that accepts EITHER a JWT Bearer token OR an X-API-Key header.
 * Extends the existing JwtGuard behavior — if an API key is present, it validates
 * that instead of requiring a JWT, and injects the owner info into the request.
 *
 * Priority:
 *   1. @Public() routes → skip auth
 *   2. X-API-Key header → validate API key
 *   3. Authorization: Bearer → delegate to JwtGuard (passport)
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = request.headers['x-api-key'];

    if (!apiKeyHeader) {
      // No API key — let the normal JwtGuard handle it
      return true; // This guard passes; JwtGuard (APP_GUARD) will still validate JWT
    }

    // Validate the API key
    const apiKey = await this.apiKeyService.validate(apiKeyHeader);
    if (!apiKey) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // Inject the owner into the request so downstream services can use it
    request.user = {
      id: apiKey.ownerId,
      email: 'api-key',
      apiKeyId: apiKey.id,
      permissions: apiKey.permissions,
    };

    // Mark this request as API-key authenticated so JwtGuard can skip it
    request.isApiKeyAuthenticated = true;

    return true;
  }
}
