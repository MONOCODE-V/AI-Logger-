import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RemoteServer } from './entities/remote-server.entity';
import { CreateRemoteServerDto } from './dto/create-remote-server.dto';
import { UpdateRemoteServerDto } from './dto/update-remote-server.dto';

@Injectable()
export class RemoteServersService {
  constructor(
    @InjectRepository(RemoteServer)
    private readonly remoteServersRepository: Repository<RemoteServer>,
  ) {}

  async create(createRemoteServerDto: CreateRemoteServerDto): Promise<RemoteServer> {
    const remoteServer = this.remoteServersRepository.create(createRemoteServerDto);
    return this.remoteServersRepository.save(remoteServer);
  }

  async findAll(): Promise<RemoteServer[]> {
    return this.remoteServersRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<RemoteServer> {
    const remoteServer = await this.remoteServersRepository.findOne({ where: { id } });
    if (!remoteServer) {
      throw new NotFoundException(`Remote Server #${id} not found`);
    }
    return remoteServer;
  }

  async update(id: string, updateRemoteServerDto: UpdateRemoteServerDto): Promise<RemoteServer> {
    const remoteServer = await this.findOne(id);
    Object.assign(remoteServer, updateRemoteServerDto);
    return this.remoteServersRepository.save(remoteServer);
  }

  async remove(id: string): Promise<void> {
    const remoteServer = await this.findOne(id);
    await this.remoteServersRepository.remove(remoteServer);
  }
}
