import { PartialType } from '@nestjs/mapped-types';
import { CreateLogSourceDto } from './create-log-source.dto';

export class UpdateLogSourceDto extends PartialType(CreateLogSourceDto) {}
