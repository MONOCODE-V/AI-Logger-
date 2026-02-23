import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum LogSourceType {
  ZABBIX = 'zabbix',
  PROMETHEUS = 'prometheus',
  CUSTOM = 'custom',
  FILE = 'file',
  API = 'api',
  SYSLOG = 'syslog',
  WEBHOOK = 'webhook',
  DATADOG = 'datadog',
  ELASTICSEARCH = 'elasticsearch',
  SPLUNK = 'splunk',
}

export enum LogSourceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  UNKNOWN = 'unknown',
}

@Entity('log_sources')
export class LogSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column()
  name: string;

  @Column({
    type: 'simple-enum',
    enum: LogSourceType,
  })
  type: LogSourceType;

  @Column({
    type: 'simple-enum',
    enum: LogSourceStatus,
    default: LogSourceStatus.UNKNOWN,
  })
  status: LogSourceStatus;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'simple-json', nullable: true })
  config?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
