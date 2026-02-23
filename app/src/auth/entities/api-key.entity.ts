import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

@Entity('api_keys')
export class ApiKey {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'user-uuid' })
  @Column()
  @Index()
  ownerId: string;

  @ApiProperty({ example: 'Production Ingestion Key' })
  @Column()
  name: string;

  /**
   * The first 8 characters of the key, used for display purposes.
   * Example: "ak_live_"
   */
  @ApiProperty({ example: 'ak_live_' })
  @Column()
  prefix: string;

  /**
   * The hashed API key. Never expose this.
   */
  @Exclude()
  @Column()
  hashedKey: string;

  @ApiProperty({ example: ['ingest', 'read'] })
  @Column({ type: 'simple-json', default: '["ingest"]' })
  permissions: string[];

  @ApiProperty({ example: true })
  @Column({ default: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-02-23T10:30:00Z', required: false })
  @Column({ type: 'datetime', nullable: true })
  lastUsedAt?: Date;

  @ApiProperty({ example: '2027-02-23T10:30:00Z', required: false })
  @Column({ type: 'datetime', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
