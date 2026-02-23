import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'alice', description: 'Unique username between 3 and 100 characters' })
  @IsString({ message: 'Username must be a string' })
  @Length(3, 100, { message: 'Username must be between 3 and 100 characters' })
  @IsNotEmpty({ message: 'Username is required' })
  username: string;

  @ApiProperty({ example: 'alice@example.com', description: 'Valid email address' })
  @IsString({ message: 'Email must be a string' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email: string;

  @ApiProperty({ example: 'password123', description: 'Password (min 6 characters)', required: false })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string;
} 

