import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dgram from 'dgram';
import * as net from 'net';
import { LogParserService } from '../logs/services/log-parser.service';
import { LogsService } from '../logs/logs.service';
import { LogFormat } from '../logs/entities/log.entity';
import { LogSourcesService } from '../log-sources/log-sources.service';
import { LogSourceType } from '../log-sources/entities/log-source.entity';

/**
 * SyslogListenerService — Receives syslog messages via UDP and TCP.
 *
 * How it works:
 *   1. Starts a UDP and TCP server on the configured port (default: 1514)
 *   2. When a syslog message arrives, it uses LogParserService (already built!)
 *      to parse RFC 3164 / 5424 format into structured log data
 *   3. Resolves which LogSource the message belongs to by matching the sender IP
 *      against LogSources of type "syslog" that have { syslogIp: "<ip>" } in their config
 *   4. Saves the parsed log via LogsService
 *
 * Customer setup (one line on their server):
 *   echo "*.* @@<AI_LOGGER_HOST>:1514" >> /etc/rsyslog.conf && systemctl restart rsyslog
 *
 * Environment variables:
 *   SYSLOG_ENABLED=true       — enable/disable the listener (default: true)
 *   SYSLOG_UDP_PORT=1514      — UDP port (default: 1514)
 *   SYSLOG_TCP_PORT=1514      — TCP port (default: 1514)
 */
@Injectable()
export class SyslogListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyslogListenerService.name);
  private udpServer: dgram.Socket | null = null;
  private tcpServer: net.Server | null = null;
  private enabled: boolean;
  private udpPort: number;
  private tcpPort: number;

  // Cache: IP → sourceId (refreshed periodically)
  private sourceIpMap = new Map<string, { sourceId: string; serverId?: string }>();
  private cacheRefreshInterval: NodeJS.Timeout | null = null;

  constructor(
    private configService: ConfigService,
    private logParser: LogParserService,
    private logsService: LogsService,
    private logSourcesService: LogSourcesService,
  ) {
    this.enabled = this.configService.get('SYSLOG_ENABLED', 'true') === 'true';
    this.udpPort = parseInt(this.configService.get('SYSLOG_UDP_PORT', '1514'), 10);
    this.tcpPort = parseInt(this.configService.get('SYSLOG_TCP_PORT', '1514'), 10);
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Syslog listener is disabled (SYSLOG_ENABLED=false)');
      return;
    }

    // Build initial source IP cache
    await this.refreshSourceIpCache();

    // Refresh cache every 60 seconds to pick up new LogSource configs
    this.cacheRefreshInterval = setInterval(() => this.refreshSourceIpCache(), 60_000);

    this.startUdpListener();
    this.startTcpListener();
  }

  onModuleDestroy() {
    if (this.cacheRefreshInterval) {
      clearInterval(this.cacheRefreshInterval);
    }
    if (this.udpServer) {
      this.udpServer.close();
      this.logger.log('Syslog UDP listener stopped');
    }
    if (this.tcpServer) {
      this.tcpServer.close();
      this.logger.log('Syslog TCP listener stopped');
    }
  }

  /**
   * Build a map of IP addresses → sourceId by reading all LogSources of type SYSLOG.
   * LogSource.config should contain: { syslogIp: "192.168.1.10" } or { syslogIps: ["..."] }
   */
  private async refreshSourceIpCache() {
    try {
      const sources = await this.logSourcesService.findAll();
      const syslogSources = sources.filter(s => s.type === LogSourceType.SYSLOG);

      this.sourceIpMap.clear();
      for (const source of syslogSources) {
        const config = source.config || {};
        const ips: string[] = [];

        if (config.syslogIp) ips.push(config.syslogIp);
        if (Array.isArray(config.syslogIps)) ips.push(...config.syslogIps);
        if (config.ip) ips.push(config.ip);

        for (const ip of ips) {
          this.sourceIpMap.set(ip, {
            sourceId: source.id,
            serverId: config.serverId,
          });
        }
      }

      this.logger.debug(
        `Syslog source IP cache refreshed: ${this.sourceIpMap.size} IP mappings from ${syslogSources.length} syslog sources`,
      );
    } catch (err) {
      this.logger.error('Failed to refresh syslog source IP cache', err);
    }
  }

  private startUdpListener() {
    try {
      this.udpServer = dgram.createSocket('udp4');

      this.udpServer.on('message', (msg, rinfo) => {
        this.handleMessage(msg.toString(), rinfo.address).catch(err =>
          this.logger.error(`Failed to handle UDP syslog from ${rinfo.address}`, err),
        );
      });

      this.udpServer.on('error', (err) => {
        this.logger.error(`Syslog UDP server error: ${err.message}`);
      });

      this.udpServer.bind(this.udpPort, () => {
        this.logger.log(`📡 Syslog UDP listener started on port ${this.udpPort}`);
      });
    } catch (err) {
      this.logger.error(`Failed to start Syslog UDP listener: ${err.message}`);
    }
  }

  private startTcpListener() {
    try {
      this.tcpServer = net.createServer((socket) => {
        const clientIp = socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
        let buffer = '';

        socket.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete last line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              this.handleMessage(trimmed, clientIp).catch(err =>
                this.logger.error(`Failed to handle TCP syslog from ${clientIp}`, err),
              );
            }
          }
        });

        socket.on('error', (err) => {
          this.logger.warn(`Syslog TCP client error (${clientIp}): ${err.message}`);
        });
      });

      this.tcpServer.on('error', (err) => {
        this.logger.error(`Syslog TCP server error: ${err.message}`);
      });

      this.tcpServer.listen(this.tcpPort, () => {
        this.logger.log(`📡 Syslog TCP listener started on port ${this.tcpPort}`);
      });
    } catch (err) {
      this.logger.error(`Failed to start Syslog TCP listener: ${err.message}`);
    }
  }

  /**
   * Handle a single syslog message: parse → resolve source → store.
   */
  private async handleMessage(rawMessage: string, senderIp: string): Promise<void> {
    // Parse with the already-built LogParserService (handles RFC 3164 + 5424)
    const parsed = this.logParser.parse(rawMessage, LogFormat.SYSLOG);

    // Resolve which LogSource this IP belongs to
    const mapping = this.sourceIpMap.get(senderIp);

    if (!mapping) {
      // Unknown IP — log it but still store with a fallback source marker
      this.logger.warn(
        `Syslog from unregistered IP ${senderIp}. ` +
        `Create a LogSource (type: syslog, config: { syslogIp: "${senderIp}" }) to map it.`,
      );
    }

    await this.logsService.create({
      sourceId: mapping?.sourceId || `unregistered:${senderIp}`,
      serverId: mapping?.serverId,
      level: parsed.level,
      message: parsed.message,
      rawContent: rawMessage,
      format: 'syslog' as any,
      metadata: {
        ...parsed.metadata,
        senderIp,
        receivedVia: 'syslog-listener',
      },
      timestamp: parsed.timestamp?.toISOString(),
    });
  }

  /**
   * Get listener status (for health checks / API).
   */
  getStatus() {
    return {
      enabled: this.enabled,
      udpPort: this.udpPort,
      tcpPort: this.tcpPort,
      udpRunning: !!this.udpServer,
      tcpRunning: !!this.tcpServer,
      registeredIps: Array.from(this.sourceIpMap.keys()),
      sourceMappings: this.sourceIpMap.size,
    };
  }

  /**
   * Manually refresh the IP cache (useful after creating new syslog sources).
   */
  async refreshCache() {
    await this.refreshSourceIpCache();
    return this.getStatus();
  }
}
