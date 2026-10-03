import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload for requesting permanent deletion of a user's account and associated data.
 *
 * Enforces an explicit confirmation string ('DELETE_MY_ACCOUNT') to guard against
 * accidental invocations, and allows an optional feedback reason for telemetry.
 */
export class DeleteAccountRequestDto {
  /**
   * Confirmation phrase required to verify intentional account deletion.
   * Must exactly match 'DELETE_MY_ACCOUNT'.
   */
  @ApiProperty({
    description:
      'Explicit confirmation phrase to guard against accidental deletion',
    example: 'DELETE_MY_ACCOUNT',
  })
  @IsString()
  @Equals('DELETE_MY_ACCOUNT', {
    message: 'Confirmation must exactly equal DELETE_MY_ACCOUNT',
  })
  confirmation: string;

  /**
   * Optional reason provided by the user explaining why they chose to delete their account.
   */
  @ApiPropertyOptional({
    description: 'Optional feedback or reason for account deletion',
    example: 'Found someone elsewhere',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
