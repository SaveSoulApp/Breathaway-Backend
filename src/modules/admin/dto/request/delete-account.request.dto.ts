import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteAccountRequestDto {
  @ApiProperty({
    description: 'The reason for deleting the account',
    example: 'Violation of Terms of Service',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;
}
