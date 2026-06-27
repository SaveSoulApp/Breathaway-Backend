import { PaginationMeta } from '@common/dto';
import { ApiProperty } from '@nestjs/swagger';
import { GenderType, IntentType, MatchStatus } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

export class MatchUserProfileDto {
  @ApiProperty({ description: 'The ID of the user' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'The first name of the user' })
  @Expose()
  firstName: string;

  @ApiProperty({
    description: 'The last name of the user',
    required: false,
  })
  @Expose()
  lastName?: string;

  @ApiProperty({
    enum: GenderType,
    description: 'The gender of the user',
    required: false,
    nullable: true,
  })
  @Expose()
  gender: GenderType | null;
}

export class MatchOtherUserProfileDto extends MatchUserProfileDto {
  @ApiProperty({
    description: 'The label associated with the like from this user',
    required: false,
    nullable: true,
  })
  @Expose()
  label?: string | null;
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
    description:
      'The intent of the calling user (the one who made this request)',
  })
  @Expose()
  myIntent: IntentType;

  @ApiProperty({
    enum: IntentType,
    description: 'The intent of the other user in this match',
  })
  @Expose()
  theirIntent: IntentType;

  @ApiProperty({
    type: MatchUserProfileDto,
    description: 'Profile of the calling user',
  })
  @Expose()
  @Type(() => MatchUserProfileDto)
  me: MatchUserProfileDto;

  @ApiProperty({
    type: MatchOtherUserProfileDto,
    description: 'Profile of the other user in the match',
  })
  @Expose()
  @Type(() => MatchOtherUserProfileDto)
  otherUser: MatchOtherUserProfileDto;
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
