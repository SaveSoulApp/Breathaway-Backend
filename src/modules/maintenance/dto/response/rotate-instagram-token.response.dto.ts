import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class RotateInstagramTokenResponseDto {
  @ApiProperty({
    description: 'Operation success status flag',
    example: true,
  })
  @Expose()
  success: boolean;

  @ApiProperty({
    description: 'Human-readable result message',
    example:
      'Instagram system access token rotated and persisted to Secret Manager successfully',
  })
  @Expose()
  message: string;
}
