import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../entities/api-key.entity';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  /**
   * Create a new API key. Returns the raw key ONCE — it cannot be retrieved again.
   */
  async create(
    ownerId: string,
    dto: CreateApiKeyDto,
  ): Promise<{ apiKey: ApiKey; rawKey: string }> {
    // Generate a secure random key: ak_live_<32 hex chars>
    const randomPart = crypto.randomBytes(24).toString('hex');
    const rawKey = `ak_live_${randomPart}`;
    const prefix = rawKey.substring(0, 12); // "ak_live_xxxx" for display

    // Hash the key for storage (SHA-256)
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = this.apiKeyRepository.create({
      ownerId,
      name: dto.name,
      prefix,
      hashedKey,
      permissions: dto.permissions || ['ingest'],
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });

    const saved = await this.apiKeyRepository.save(apiKey);
    return { apiKey: saved, rawKey };
  }

  /**
   * Validate an API key. Returns the ApiKey entity if valid, null if not.
   */
  async validate(rawKey: string): Promise<ApiKey | null> {
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.apiKeyRepository.findOne({
      where: { hashedKey, isActive: true },
    });

    if (!apiKey) return null;

    // Check expiration
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return null;
    }

    // Update last used timestamp (fire and forget)
    this.apiKeyRepository.update(apiKey.id, { lastUsedAt: new Date() });

    return apiKey;
  }

  /**
   * List all API keys for an owner (without hashed keys).
   */
  async findAllByOwner(ownerId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Revoke (deactivate) an API key.
   */
  async revoke(id: string, ownerId: string): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id, ownerId },
    });
    if (!apiKey) {
      throw new NotFoundException(`API Key #${id} not found`);
    }
    apiKey.isActive = false;
    return this.apiKeyRepository.save(apiKey);
  }
}
