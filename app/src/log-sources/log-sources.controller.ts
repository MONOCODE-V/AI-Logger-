import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { LogSourcesService } from './log-sources.service';
import { CreateLogSourceDto } from './dto/create-log-source.dto';
import { UpdateLogSourceDto } from './dto/update-log-source.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '../auth/interfaces/current-user.interface';

@Controller('log-sources')
export class LogSourcesController {
  constructor(private readonly logSourcesService: LogSourcesService) {}

  @Post()
  create(
    @Body() createLogSourceDto: CreateLogSourceDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    // automatically stamp ownerId from the authenticated user
    createLogSourceDto.ownerId = user.id;
    return this.logSourcesService.create(createLogSourceDto);
  }

  @Get()
  findAll() {
    return this.logSourcesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.logSourcesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateLogSourceDto: UpdateLogSourceDto,
  ) {
    return this.logSourcesService.update(id, updateLogSourceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.logSourcesService.remove(id);
  }
}
