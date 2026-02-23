import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RemoteServersService } from './remote-servers.service';
import { RemoteServersController } from './remote-servers.controller';
import { RemoteServer } from './entities/remote-server.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RemoteServer])],
  controllers: [RemoteServersController],
  providers: [RemoteServersService],
  exports: [RemoteServersService],
})
export class RemoteServersModule {}
