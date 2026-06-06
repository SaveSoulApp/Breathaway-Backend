import { ApiProperty } from '@nestjs/swagger';
import { IntentType, MatchStatus } from '@prisma/client';
import { Expose, Type } from 'class-transformer';
import { PaginationMeta } from '@common/dto';

export class MatchOtherUserDto {
  @ApiProperty({ description: 'The ID of the other user' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'The first name of the other user' })
  @Expose()
  firstName: string;

  @ApiProperty({
    description: 'The last name of the other user',
    required: false,
  })
  @Expose()
  lastName?: string;
}

export class MatchResponseDto {
  @ApiProperty({ description: 'The ID of the match' })
  @Expose()
  id: string;

  @ApiProperty({
    enum: MatchStatus,
    description: 'The current status of the match',
  })
  @Expose()
  status: MatchStatus;

  @ApiProperty({ description: 'When the match was created' })
  @Expose()
  matchedAt: Date;

  @ApiProperty({
    enum: IntentType,
    description: 'The intent of the first like',
  })
  @Expose()
  intentOne: IntentType;

  @ApiProperty({
    enum: IntentType,
    description: 'The intent of the second like',
  })
  @Expose()
  intentTwo: IntentType;

  @ApiProperty({
    type: MatchOtherUserDto,
    description: 'Basic profile of the other user in the match',
  })
  @Expose()
  @Type(() => MatchOtherUserDto)
  otherUser: MatchOtherUserDto;
}

export class PaginatedMatchResponseDto {
  @ApiProperty({ type: [MatchResponseDto] })
  @Expose()
  @Type(() => MatchResponseDto)
  data: MatchResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  @Expose()
  @Type(() => PaginationMeta)
  meta: PaginationMeta;
}
