import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Alert, AlertSeverity } from '../entities/alert.entity';
import { RuleAction } from '../entities/alert-rule.entity';
import { OnEvent } from '@nestjs/event-emitter';

export interface NotificationResult {
  success: boolean;
  channel: string;
  message?: string;
  error?: string;
}

/**
 * NotificationsService - Handles sending notifications via various channels.
 * Supports email, webhooks, Slack, and in-app notifications.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly configService: ConfigService) {}

  @OnEvent('ticket.created')
  async handleTicketCreatedEvent(payload: any) {
    const { ticket, rule, log } = payload;
    this.logger.log(`Received ticket.created event for ticket ${ticket.id}. Sending notifications...`);

    if (rule && rule.actions && rule.actions.length > 0) {
      // Map ticket back to an alert-like structure for the existing notification logic
      const alertLike = {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        severity: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
      } as any;

      await this.sendAll(alertLike, rule.actions);
    } else {
      this.logger.log(`No actions configured for rule ${rule?.name || 'unknown'}. Skipping notifications.`);
    }
  }

  /**
   * Send notification based on action configuration
   */
  async send(alert: Alert, action: RuleAction): Promise<NotificationResult> {
    switch (action.type) {
      case 'email':
        return this.sendEmail(alert, action.config);
      case 'webhook':
        return this.sendWebhook(alert, action.config);
      case 'slack':
        return this.sendSlack(alert, action.config);
      case 'in_app':
        return this.sendInApp(alert, action.config);
      default:
        return { success: false, channel: action.type, error: 'Unknown notification type' };
    }
  }

  /**
   * Send notifications for all actions
   */
  async sendAll(alert: Alert, actions: RuleAction[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    
    for (const action of actions) {
      const result = await this.send(alert, action);
      results.push(result);
      
      if (!result.success) {
        this.logger.warn(`Failed to send ${action.type} notification: ${result.error}`);
      }
    }

    return results;
  }

  /**
   * Send email notification
   */
  private async sendEmail(alert: Alert, config: Record<string, any>): Promise<NotificationResult> {
    const { email, cc } = config;
    
    // In production, integrate with email service (SendGrid, AWS SES, etc.)
    // For now, log the notification
    this.logger.log(`[EMAIL] To: ${email}${cc ? `, CC: ${cc}` : ''}`);
    this.logger.log(`[EMAIL] Subject: [${alert.severity.toUpperCase()}] ${alert.title}`);
    this.logger.log(`[EMAIL] Body: ${alert.description}`);

    // Placeholder for actual email implementation
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    
    if (!smtpHost) {
      return {
        success: true,
        channel: 'email',
        message: 'Email notification logged (SMTP not configured)',
      };
    }

    // TODO: Implement actual email sending
    return {
      success: true,
      channel: 'email',
      message: `Email sent to ${email}`,
    };
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(alert: Alert, config: Record<string, any>): Promise<NotificationResult> {
    const { url, headers = {}, method = 'POST' } = config;

    if (!url) {
      return { success: false, channel: 'webhook', error: 'Webhook URL not configured' };
    }

    const payload = {
      alert: {
        id: alert.id,
        title: alert.title,
        description: alert.description,
        severity: alert.severity,
        status: alert.status,
        sourceId: alert.sourceId,
        createdAt: alert.createdAt,
        metadata: alert.metadata,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return {
          success: false,
          channel: 'webhook',
          error: `Webhook returned ${response.status}`,
        };
      }

      return {
        success: true,
        channel: 'webhook',
        message: `Webhook delivered to ${url}`,
      };
    } catch (error: any) {
      return {
        success: false,
        channel: 'webhook',
        error: error.message,
      };
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlack(alert: Alert, config: Record<string, any>): Promise<NotificationResult> {
    const { webhookUrl, channel } = config;
    const url = webhookUrl || this.configService.get<string>('SLACK_WEBHOOK_URL');

    if (!url) {
      return { success: false, channel: 'slack', error: 'Slack webhook URL not configured' };
    }

    const severityColors: Record<AlertSeverity, string> = {
      [AlertSeverity.LOW]: '#36a64f',
      [AlertSeverity.MEDIUM]: '#daa038',
      [AlertSeverity.HIGH]: '#ff6b35',
      [AlertSeverity.CRITICAL]: '#cc0000',
    };

    const payload = {
      channel,
      attachments: [
        {
          color: severityColors[alert.severity],
          title: `🚨 ${alert.title}`,
          text: alert.description,
          fields: [
            { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
            { title: 'Status', value: alert.status, short: true },
            { title: 'Source', value: alert.sourceId || 'N/A', short: true },
            { title: 'Alert ID', value: alert.id, short: true },
          ],
          footer: 'AI Logger',
          ts: Math.floor(alert.createdAt.getTime() / 1000).toString(),
        },
      ],
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return {
          success: false,
          channel: 'slack',
          error: `Slack returned ${response.status}`,
        };
      }

      return {
        success: true,
        channel: 'slack',
        message: 'Slack notification sent',
      };
    } catch (error: any) {
      return {
        success: false,
        channel: 'slack',
        error: error.message,
      };
    }
  }

  /**
   * Send in-app notification (stored for UI to display)
   */
  private async sendInApp(alert: Alert, config: Record<string, any>): Promise<NotificationResult> {
    // In-app notifications are already stored as alerts
    // This could trigger WebSocket notification to connected clients
    // For now, just log it
    this.logger.log(`[IN_APP] Alert created: ${alert.id} - ${alert.title}`);

    // TODO: Implement WebSocket push to connected clients
    
    return {
      success: true,
      channel: 'in_app',
      message: 'In-app notification created',
    };
  }

  /**
   * Test notification channel
   */
  async testChannel(
    type: 'email' | 'webhook' | 'slack' | 'in_app',
    config: Record<string, any>,
  ): Promise<NotificationResult> {
    const testAlert: Alert = {
      id: 'test-alert-id',
      title: 'Test Notification',
      description: 'This is a test notification from AI Logger',
      severity: AlertSeverity.LOW,
      status: 'active' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.send(testAlert, { type, config });
  }
}
