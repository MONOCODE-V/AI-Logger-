import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RemoteServersService } from './remote-servers.service';
import { CreateRemoteServerDto } from './dto/create-remote-server.dto';
import { UpdateRemoteServerDto } from './dto/update-remote-server.dto';
import { RemoteServer } from './entities/remote-server.entity';

@ApiTags('remote-servers')
@ApiBearerAuth()
@Controller('remote-servers')
export class RemoteServersController {
  constructor(private readonly remoteServersService: RemoteServersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a remote server' })
  async create(@Body() createRemoteServerDto: CreateRemoteServerDto): Promise<RemoteServer> {
    return this.remoteServersService.create(createRemoteServerDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all remote servers' })
  async findAll(): Promise<RemoteServer[]> {
    return this.remoteServersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific remote server' })
  async findOne(@Param('id') id: string): Promise<RemoteServer> {
    return this.remoteServersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a remote server' })
  async update(
    @Param('id') id: string,
    @Body() updateRemoteServerDto: UpdateRemoteServerDto,
  ): Promise<RemoteServer> {
    return this.remoteServersService.update(id, updateRemoteServerDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a remote server' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.remoteServersService.remove(id);
  }
}
