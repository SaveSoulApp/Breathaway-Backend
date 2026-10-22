import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { IdentitySplitDto, IntentSplitDto } from './report.response.dto';

export class LikeStatusSplitDto {
  @ApiProperty({ description: 'Active likes awaiting a match' })
  pending: number;

  @ApiProperty({ description: 'Likes successfully converted into matches' })
  matched: number;

  @ApiProperty({ description: 'Likes voided or expired' })
  voided: number;

  @ApiProperty({ description: 'Likes explicitly withdrawn by sender' })
  withdrawn: number;

  @ApiProperty({ description: 'Soft-deleted likes' })
  deleted: number;
}

export class MatchStatusSplitDto {
  @ApiProperty({ description: 'Active matches' })
  active: number;

  @ApiProperty({ description: 'Unmatched pairings' })
  unmatched: number;

  @ApiProperty({ description: 'Matches severed due to blocks' })
  blocked: number;
}

export class MutualIntentSplitDto {
  @ApiProperty({ description: 'Both parties chose RELATIONSHIP intent' })
  relationshipRelationship: number;

  @ApiProperty({ description: 'Both parties chose CASUAL intent' })
  casualCasual: number;

  @ApiProperty({ description: 'Both parties chose OPEN intent' })
  openOpen: number;

  @ApiProperty({
    description:
      'Parties chose differing intents (e.g., Casual & Relationship)',
  })
  mixed: number;
}

export class EngagementIdentitiesDto {
  @ApiProperty({ description: 'Total active identities' })
  total: number;

  @ApiProperty({ description: 'Identities claimed by registered users' })
  claimed: number;

  @ApiProperty({ description: 'Unclaimed orphan identities in viral backlog' })
  unclaimed: number;

  @ApiProperty({ description: 'Verified identities count' })
  verified: number;

  @ApiProperty({
    description: 'Pending likes waiting for unclaimed contacts to sign up',
  })
  viralPendingLikes: number;

  @ApiProperty({ type: IdentitySplitDto })
  @ValidateNested()
  @Type(() => IdentitySplitDto)
  split: IdentitySplitDto;
}

export class EngagementLikesDto {
  @ApiProperty({ description: 'Total likes sent' })
  total: number;

  @ApiProperty({ description: 'Average likes per user' })
  averagePerUser: number;

  @ApiProperty({ type: LikeStatusSplitDto })
  @ValidateNested()
  @Type(() => LikeStatusSplitDto)
  statusSplit: LikeStatusSplitDto;

  @ApiProperty({ type: IntentSplitDto })
  @ValidateNested()
  @Type(() => IntentSplitDto)
  intentSplit: IntentSplitDto;

  @ApiProperty({ type: IdentitySplitDto })
  @ValidateNested()
  @Type(() => IdentitySplitDto)
  targetIdentitySplit: IdentitySplitDto;
}

export class EngagementMatchesDto {
  @ApiProperty({ description: 'Total matches established' })
  total: number;

  @ApiProperty({
    description: 'Match conversion rate as (2 * matches / likes) * 100',
  })
  conversionRatePercent: number;

  @ApiProperty({ type: MatchStatusSplitDto })
  @ValidateNested()
  @Type(() => MatchStatusSplitDto)
  statusSplit: MatchStatusSplitDto;

  @ApiProperty({ type: MutualIntentSplitDto })
  @ValidateNested()
  @Type(() => MutualIntentSplitDto)
  mutualIntentSplit: MutualIntentSplitDto;
}

export class EngagementChatsDto {
  @ApiProperty({ description: 'Total chat rooms created' })
  totalRooms: number;

  @ApiProperty({ description: 'Active chat rooms with at least 1 message' })
  activeRooms: number;

  @ApiProperty({ description: 'Total messages exchanged' })
  totalMessages: number;

  @ApiProperty({
    description: 'Percentage of sent messages that have been read',
  })
  readRatePercent: number;

  @ApiProperty({ description: 'Average messages per active chat room' })
  averageMessagesPerActiveRoom: number;
}

export class EngagementSafetyDto {
  @ApiProperty({ description: 'Total blocks on record' })
  totalBlocks: number;

  @ApiProperty({ description: 'Direct user-to-user blocks' })
  directUserBlocks: number;

  @ApiProperty({ description: 'Phone hash pre-registration blocks' })
  phoneHashBlocks: number;
}

export class ReportEngagementResponseDto {
  @ApiProperty({ type: EngagementIdentitiesDto })
  @ValidateNested()
  @Type(() => EngagementIdentitiesDto)
  identities: EngagementIdentitiesDto;

  @ApiProperty({ type: EngagementLikesDto })
  @ValidateNested()
  @Type(() => EngagementLikesDto)
  likes: EngagementLikesDto;

  @ApiProperty({ type: EngagementMatchesDto })
  @ValidateNested()
  @Type(() => EngagementMatchesDto)
  matches: EngagementMatchesDto;

  @ApiProperty({ type: EngagementChatsDto })
  @ValidateNested()
  @Type(() => EngagementChatsDto)
  chats: EngagementChatsDto;

  @ApiProperty({ type: EngagementSafetyDto })
  @ValidateNested()
  @Type(() => EngagementSafetyDto)
  safety: EngagementSafetyDto;
}
