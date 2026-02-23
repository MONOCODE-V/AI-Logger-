import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket, TicketStatus, TicketPriority } from './entities/ticket.entity';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('anomaly.detected')
  async handleAnomalyDetectedEvent(payload: any) {
    this.logger.log(`Received anomaly.detected event. Creating ticket...`);
    
    const { rule, log, message, priority } = payload;

    // Map alert priority to ticket priority
    let ticketPriority = TicketPriority.MEDIUM;
    if (priority === 'CRITICAL') ticketPriority = TicketPriority.CRITICAL;
    if (priority === 'HIGH') ticketPriority = TicketPriority.HIGH;
    if (priority === 'LOW') ticketPriority = TicketPriority.LOW;

    const ticket = this.ticketRepository.create({
      title: `Alert: ${rule?.name || 'Anomaly Detected'}`,
      description: message || `An anomaly was detected based on rule: ${rule?.name}`,
      priority: ticketPriority,
      status: TicketStatus.OPEN,
      logId: log?.id,
      remoteServerId: log?.remoteServerId,
      ruleId: rule?.id,
    });

    const savedTicket = await this.ticketRepository.save(ticket);
    this.logger.log(`Ticket created with ID: ${savedTicket.id}`);

    // Emit ticket.created event for notifications
    this.eventEmitter.emit('ticket.created', {
      ticket: savedTicket,
      rule,
      log,
    });
  }

  async findAll(): Promise<Ticket[]> {
    return this.ticketRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Ticket | null> {
    return this.ticketRepository.findOne({ where: { id } });
  }

  async updateStatus(id: string, status: TicketStatus): Promise<Ticket | null> {
    await this.ticketRepository.update(id, { status });
    return this.findOne(id);
  }
}
