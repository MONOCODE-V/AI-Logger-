import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Client as SSHClient } from 'ssh2';
import { RemoteServersService } from '../remote-servers/remote-servers.service';
import { RemoteServer, RemoteServerStatus } from '../remote-servers/entities/remote-server.entity';
import { LogSourcesService } from '../log-sources/log-sources.service';
import { LogSource, LogSourceType } from '../log-sources/entities/log-source.entity';
import { LogsService } from '../logs/logs.service';
import { LogParserService } from '../logs/services/log-parser.service';
import { LogFormat } from '../logs/entities/log.entity';

/**
 * ScheduledPullService — Periodically connect to remote servers and pull logs.
 *
 * How it works:
 *   1. On startup, reads all active RemoteServers + their LogSources
 *   2. For each LogSource that has pullEnabled: true in config, creates a cron interval
 *   3. On each tick:
 *      a. SSH into the server → tail/read log file → parse → store
 *      b. OR HTTP GET a log endpoint → parse → store
 *   4. Tracks cursor (last byte offset / last timestamp) so we only pull new lines
 *
 * RemoteServer.config example:
 *   {
 *     "ssh": { "host": "10.0.1.5", "port": 22, "username": "logagent", "privateKey": "..." },
 *     "authMethod": "ssh-key" | "ssh-password"
 *   }
 *
 * LogSource.config example for file-based pull:
 *   {
 *     "pullEnabled": true,
 *     "pullIntervalMs": 30000,          // default: 60000 (1 min)
 *     "pullMethod": "ssh-tail" | "http",
 *     "filePath": "/var/log/syslog",     // for ssh-tail
 *     "httpUrl": "http://...",            // for http pull
 *     "format": "syslog" | "json" | "plain",
 *     "serverId": "uuid-of-remote-server"
 *   }
 */
@Injectable()
export class ScheduledPullService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledPullService.name);

  // Track byte offsets (cursor) per LogSource to only pull new data
  // Key: sourceId, Value: { byteOffset, lastTimestamp }
  private cursors = new Map<
    string,
    { byteOffset: number; lastTimestamp?: string }
  >();

  // Active intervals
  private activeIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private remoteServersService: RemoteServersService,
    private logSourcesService: LogSourcesService,
    private logsService: LogsService,
    private logParser: LogParserService,
  ) {}

  async onModuleInit() {
    await this.registerAllPullJobs();
    this.logger.log(
      `Scheduled Pull service started with ${this.activeIntervals.size} active pull jobs`,
    );
  }

  onModuleDestroy() {
    for (const [sourceId, interval] of this.activeIntervals) {
      clearInterval(interval);
      this.logger.debug(`Stopped pull job for source ${sourceId}`);
    }
    this.activeIntervals.clear();
  }

  /**
   * Discover all LogSources with pullEnabled and set up intervals.
   */
  async registerAllPullJobs() {
    const sources = await this.logSourcesService.findAll();
    const pullSources = sources.filter(
      (s) => s.config?.pullEnabled === true,
    );

    this.logger.log(
      `Found ${pullSources.length} log sources with pull enabled`,
    );

    for (const source of pullSources) {
      await this.registerPullJob(source);
    }
  }

  /**
   * Register a single pull job for a LogSource.
   */
  async registerPullJob(source: LogSource) {
    if (this.activeIntervals.has(source.id)) {
      this.logger.warn(
        `Pull job already registered for source ${source.id} (${source.name})`,
      );
      return;
    }

    const intervalMs = source.config?.pullIntervalMs || 60_000;
    const pullMethod = source.config?.pullMethod || 'ssh-tail';

    this.logger.log(
      `Registering pull job for "${source.name}" (${source.id}): ` +
        `method=${pullMethod}, interval=${intervalMs}ms`,
    );

    // Initialize cursor
    if (!this.cursors.has(source.id)) {
      this.cursors.set(source.id, { byteOffset: 0 });
    }

    // Do an initial pull immediately
    this.executePull(source).catch((err) =>
      this.logger.error(
        `Initial pull failed for ${source.name}: ${err.message}`,
      ),
    );

    // Then set up recurring interval
    const interval = setInterval(async () => {
      try {
        await this.executePull(source);
      } catch (err) {
        this.logger.error(
          `Scheduled pull failed for ${source.name}: ${err.message}`,
        );
      }
    }, intervalMs);

    this.activeIntervals.set(source.id, interval);

    // Also register with NestJS SchedulerRegistry for visibility
    try {
      this.schedulerRegistry.addInterval(`pull-${source.id}`, interval);
    } catch {
      // SchedulerRegistry may throw if name exists — safe to ignore
    }
  }

  /**
   * Unregister a pull job (e.g., when a source is deleted or disabled).
   */
  unregisterPullJob(sourceId: string) {
    const interval = this.activeIntervals.get(sourceId);
    if (interval) {
      clearInterval(interval);
      this.activeIntervals.delete(sourceId);
      this.cursors.delete(sourceId);
      try {
        this.schedulerRegistry.deleteInterval(`pull-${sourceId}`);
      } catch {
        // Ignore
      }
      this.logger.log(`Unregistered pull job for source ${sourceId}`);
    }
  }

  /**
   * Execute a single pull cycle for one LogSource.
   */
  private async executePull(source: LogSource): Promise<void> {
    const config = source.config || {};
    const pullMethod = config.pullMethod || 'ssh-tail';

    let rawLines: string[];

    switch (pullMethod) {
      case 'ssh-tail':
        rawLines = await this.pullViaSSH(source);
        break;
      case 'http':
        rawLines = await this.pullViaHTTP(source);
        break;
      default:
        this.logger.warn(`Unknown pull method "${pullMethod}" for source ${source.id}`);
        return;
    }

    if (rawLines.length === 0) return;

    const format = this.resolveLogFormat(config.format || 'plain');

    // Parse and store each line
    let ingested = 0;
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = this.logParser.parse(trimmed, format);

        await this.logsService.create({
          sourceId: source.id,
          serverId: config.serverId,
          level: parsed.level,
          message: parsed.message,
          rawContent: trimmed,
          format: format as any,
          metadata: {
            ...parsed.metadata,
            receivedVia: 'scheduled-pull',
            pullMethod,
          },
          timestamp: parsed.timestamp?.toISOString(),
        });
        ingested++;
      } catch (err) {
        this.logger.warn(
          `Failed to parse/store log line from ${source.name}: ${err.message}`,
        );
      }
    }

    if (ingested > 0) {
      this.logger.debug(
        `Pulled ${ingested} new log lines from "${source.name}" via ${pullMethod}`,
      );
    }
  }

  // ─── SSH Pull ───────────────────────────────────────────────

  /**
   * SSH into a remote server and read new lines from a log file.
   * Uses byte offset tracking so we only read new content.
   */
  private async pullViaSSH(source: LogSource): Promise<string[]> {
    const config = source.config || {};
    const serverId = config.serverId;

    if (!serverId) {
      this.logger.warn(`Source "${source.name}" has no serverId in config`);
      return [];
    }

    let server: RemoteServer;
    try {
      server = await this.remoteServersService.findOne(serverId);
    } catch {
      this.logger.warn(`Remote server ${serverId} not found for source ${source.name}`);
      return [];
    }

    if (server.status !== RemoteServerStatus.ACTIVE) {
      this.logger.debug(`Skipping pull for ${source.name}: server "${server.name}" is ${server.status}`);
      return [];
    }

    const sshConfig = server.config?.ssh || {};
    const filePath = config.filePath || '/var/log/syslog';
    const cursor = this.cursors.get(source.id) || { byteOffset: 0 };

    // Build a command that reads from the byte offset onwards:
    //   dd if=/var/log/syslog bs=1 skip=<offset> 2>/dev/null
    // More efficient: tail -c +<offset+1> <file>
    const skipBytes = cursor.byteOffset;
    const command = `tail -c +${skipBytes + 1} ${filePath} 2>/dev/null`;

    return new Promise<string[]>((resolve) => {
      const conn = new SSHClient();
      const timeout = setTimeout(() => {
        this.logger.warn(`SSH timeout for ${server.name} (${source.name})`);
        conn.end();
        resolve([]);
      }, 30_000);

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            this.logger.error(`SSH exec error on ${server.name}: ${err.message}`);
            conn.end();
            resolve([]);
            return;
          }

          let data = '';
          stream.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });

          stream.stderr.on('data', (chunk: Buffer) => {
            this.logger.debug(`SSH stderr (${server.name}): ${chunk.toString().trim()}`);
          });

          stream.on('close', () => {
            clearTimeout(timeout);
            conn.end();

            if (data.length === 0) {
              resolve([]);
              return;
            }

            // Update cursor
            const newOffset = cursor.byteOffset + Buffer.byteLength(data, 'utf8');
            this.cursors.set(source.id, {
              byteOffset: newOffset,
              lastTimestamp: new Date().toISOString(),
            });

            const lines = data.split('\n').filter((l) => l.trim());
            resolve(lines);
          });
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        this.logger.error(
          `SSH connection error for ${server.name}: ${err.message}`,
        );
        resolve([]);
      });

      // Connect
      const connectConfig: any = {
        host: sshConfig.host || this.extractHost(server.url),
        port: sshConfig.port || 22,
        username: sshConfig.username || 'root',
        readyTimeout: 15_000,
      };

      if (sshConfig.privateKey) {
        connectConfig.privateKey = sshConfig.privateKey;
      } else if (sshConfig.password) {
        connectConfig.password = sshConfig.password;
      } else {
        this.logger.warn(
          `No SSH credentials for server ${server.name}. Configure ssh.privateKey or ssh.password in server config.`,
        );
        clearTimeout(timeout);
        resolve([]);
        return;
      }

      conn.connect(connectConfig);
    });
  }

  // ─── HTTP Pull ──────────────────────────────────────────────

  /**
   * Pull logs from an HTTP endpoint (e.g., a log API on the remote server).
   * Supports cursor via ?since=<timestamp> query param.
   */
  private async pullViaHTTP(source: LogSource): Promise<string[]> {
    const config = source.config || {};
    const httpUrl = config.httpUrl;

    if (!httpUrl) {
      this.logger.warn(`Source "${source.name}" has no httpUrl in config`);
      return [];
    }

    try {
      const cursor = this.cursors.get(source.id);
      let url = httpUrl;

      // Append ?since= cursor if available
      if (cursor?.lastTimestamp) {
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}since=${encodeURIComponent(cursor.lastTimestamp)}`;
      }

      const headers: Record<string, string> = {
        Accept: 'application/json, text/plain',
      };
      if (config.httpAuthHeader) {
        headers['Authorization'] = config.httpAuthHeader;
      }
      if (config.httpApiKey) {
        headers['X-API-Key'] = config.httpApiKey;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        this.logger.warn(
          `HTTP pull from ${url} returned ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const contentType = response.headers.get('content-type') || '';
      const body = await response.text();

      // Update cursor
      this.cursors.set(source.id, {
        byteOffset: 0,
        lastTimestamp: new Date().toISOString(),
      });

      // If JSON array, return each item as a separate line
      if (contentType.includes('json')) {
        try {
          const json = JSON.parse(body);
          if (Array.isArray(json)) {
            return json.map((item) =>
              typeof item === 'string' ? item : JSON.stringify(item),
            );
          }
          return [body];
        } catch {
          return [body];
        }
      }

      // Plain text: split by newline
      return body.split('\n');
    } catch (err) {
      this.logger.error(
        `HTTP pull failed for ${source.name}: ${err.message}`,
      );
      return [];
    }
  }

  // ─── Helpers ────────────────────────────────────────────────

  private resolveLogFormat(format: string): LogFormat {
    const map: Record<string, LogFormat> = {
      json: LogFormat.JSON,
      syslog: LogFormat.SYSLOG,
      plain: LogFormat.PLAIN,
      custom: LogFormat.CUSTOM,
    };
    return map[format.toLowerCase()] || LogFormat.PLAIN;
  }

  private extractHost(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      // Could be just an IP or hostname
      return url.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
    }
  }

  /**
   * Get current status of all pull jobs (for API / health checks).
   */
  getStatus() {
    const jobs: Array<{
      sourceId: string;
      cursor: { byteOffset: number; lastTimestamp?: string };
    }> = [];

    for (const [sourceId, cursor] of this.cursors) {
      jobs.push({ sourceId, cursor });
    }

    return {
      activeJobs: this.activeIntervals.size,
      jobs,
    };
  }

  /**
   * Manually trigger a pull for a specific source (for testing / on-demand).
   */
  async triggerPull(sourceId: string): Promise<{ success: boolean; message: string }> {
    const source = await this.logSourcesService.findOne(sourceId);
    if (!source.config?.pullEnabled) {
      return { success: false, message: 'Pull is not enabled for this source' };
    }

    try {
      await this.executePull(source);
      return { success: true, message: `Pull completed for ${source.name}` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}
