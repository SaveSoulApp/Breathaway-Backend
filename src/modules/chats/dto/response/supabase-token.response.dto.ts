import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class SupabaseTokenResponseDto {
  @ApiProperty({
    description: 'Supabase Realtime JWT for client authentication',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @Expose()
  token: string;
}
