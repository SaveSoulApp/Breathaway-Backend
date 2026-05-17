import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, IsString } from 'class-validator';

/* istanbul ignore next */
export class ConsumeCreditsRequestDto {
  @ApiProperty({ description: 'The ULID of the user consuming credits' })
  @IsString()
  userId: string;

  @ApiProperty({
    description:
      'Amount of credits to consume (positive value, will be deducted)',
  })
  @IsInt()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Reference ID (e.g. likeId)' })
  @IsString()
  referenceId: string;
}
