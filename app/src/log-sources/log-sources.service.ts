import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateLogSourceDto } from './dto/create-log-source.dto';
import { UpdateLogSourceDto } from './dto/update-log-source.dto';
import { LogSource } from './entities/log-source.entity';

@Injectable()
export class LogSourcesService {
  constructor(
    @InjectRepository(LogSource)
    private readonly logSourcesRepository: Repository<LogSource>,
  ) {}

  create(createLogSourceDto: CreateLogSourceDto): Promise<LogSource> {
    const logSource = this.logSourcesRepository.create(createLogSourceDto);
    return this.logSourcesRepository.save(logSource);
  }

  findAll(): Promise<LogSource[]> {
    return this.logSourcesRepository.find();
  }

  async findOne(id: string): Promise<LogSource> {
    const logSource = await this.logSourcesRepository.findOne({ where: { id } });
    if (!logSource) {
      throw new NotFoundException(`LogSource #${id} not found`);
    }
    return logSource;
  }

  async update(id: string, updateLogSourceDto: UpdateLogSourceDto): Promise<LogSource> {
    const logSource = await this.findOne(id);
    Object.assign(logSource, updateLogSourceDto);
    return this.logSourcesRepository.save(logSource);
  }

  async remove(id: string): Promise<void> {
    const logSource = await this.findOne(id);
    await this.logSourcesRepository.remove(logSource);
  }
}
