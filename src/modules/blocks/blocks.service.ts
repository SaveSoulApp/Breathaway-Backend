import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { CreateBlockDto } from './dto';

/** Internal Prisma result shape used as a typed intermediary before mapping to the response DTO. */
interface BlockWithProfile {
  id: string;
  createdAt: Date;
  blocked: {
    id: string;
    profile: {
      firstName: string | null;
      lastName: string | null;
    } | null;
  };
}

/**
 * Owns the user-blocking domain — creating, retrieving, and soft-deleting block relationships.
 * Uses soft deletes (`deletedAt`) to preserve history while allowing re-blocking the same user.
 */
@Injectable()
export class BlocksService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Blocks a target user, handling self-block prevention, target existence verification, and re-blocking
   * by reactivating a soft-deleted record rather than creating a duplicate. Emits a `BLOCK_CREATED`
   * audit log on both new and reactivated blocks.
   *
   * @param blockerUserId - ID of the authenticated user initiating the block.
   * @param createBlockDto - Payload containing the ID of the user to block.
   * @returns The mapped block response including the blocked user's profile.
   * @throws {BadRequestException} When `blockerUserId` equals `blockedUserId` (self-block).
   * @throws {NotFoundException} When the target user does not exist.
   * @throws {ConflictException} When an active block for this pair already exists.
   */
  async create(blockerUserId: string, createBlockDto: CreateBlockDto) {
    const { blockedUserId } = createBlockDto;

    // 1. Prevent self-block
    if (blockerUserId === blockedUserId) {
      throw new BadRequestException('You cannot block yourself');
    }

    // 2. Verify blocked user exists
    const blockedUserExists = await this.prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true },
    });

    if (!blockedUserExists) {
      throw new NotFoundException('User to block not found');
    }

    // 3. Check for existing block
    const existingBlock = await this.prisma.block.findUnique({
      where: {
        blockerUserId_blockedUserId: {
          blockerUserId,
          blockedUserId,
        },
      },
    });

    if (existingBlock) {
      if (existingBlock.deletedAt === null) {
        throw new ConflictException('User already blocked');
      }

      // Reactivate soft-deleted block
      const reactivatedBlock = await this.prisma.block.update({
        where: { id: existingBlock.id },
        data: {
          deletedAt: null,
          createdAt: DateUtil.now(), // Resetting createdAt makes it a "new" block in terms of history/sorting
        },
        select: {
          id: true,
          createdAt: true,
          blocked: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      this.emitAuditLog({
        actionType: AuditActionType.BLOCK_CREATED,
        userId: blockerUserId,
        resourceId: reactivatedBlock.id,
        metadata: { blockedUserId },
      });

      return this.mapToResponseDto(reactivatedBlock);
    }

    // 4. Create new block
    const newBlock = await this.prisma.block.create({
      data: {
        blockerUserId,
        blockedUserId,
      },
      select: {
        id: true,
        createdAt: true,
        blocked: {
          select: {
            id: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    this.emitAuditLog({
      actionType: AuditActionType.BLOCK_CREATED,
      userId: blockerUserId,
      resourceId: newBlock.id,
      metadata: { blockedUserId },
    });

    return this.mapToResponseDto(newBlock);
  }

  /**
   * Returns all active (non-soft-deleted) blocks placed by the given user, ordered newest first.
   *
   * @param userId - ID of the authenticated user whose block list is being retrieved.
   * @returns An array of mapped block response objects, each including the blocked user's profile.
   */
  async findAllForUser(userId: string) {
    const blocks = await this.prisma.block.findMany({
      where: {
        blockerUserId: userId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        createdAt: true,
        blocked: {
          select: {
            id: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return blocks.map((block) => this.mapToResponseDto(block));
  }

  /**
   * Fetches a single active block by ID, scoped to the caller's `userId` to prevent cross-user record access.
   *
   * @param blockId - ID of the block record to retrieve.
   * @param userId - ID of the authenticated user; used to enforce ownership.
   * @returns The mapped block response including the blocked user's profile.
   * @throws {NotFoundException} When no active block with the given ID exists for this user.
   */
  async findOneForUser(blockId: string, userId: string) {
    const block = await this.prisma.block.findFirst({
      where: {
        id: blockId,
        blockerUserId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        createdAt: true,
        blocked: {
          select: {
            id: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!block) {
      throw new NotFoundException('Block not found');
    }

    return this.mapToResponseDto(block);
  }

  /**
   * Soft-deletes a block by setting `deletedAt`, preserving history and allowing the user to re-block
   * the same person later. Emits a `BLOCK_DELETED` audit log on success.
   *
   * @param blockId - ID of the block record to remove.
   * @param userId - ID of the authenticated user; enforces ownership before deletion.
   * @throws {NotFoundException} When no active block with the given ID exists or is not owned by `userId`.
   */
  async delete(blockId: string, userId: string) {
    const block = await this.prisma.block.findFirst({
      where: {
        id: blockId,
        blockerUserId: userId,
        deletedAt: null,
      },
    });

    if (!block) {
      throw new NotFoundException('Block not found');
    }

    await this.prisma.block.update({
      where: { id: block.id },
      data: {
        deletedAt: DateUtil.now(),
      },
    });

    this.emitAuditLog({
      actionType: AuditActionType.BLOCK_DELETED,
      userId: userId,
      resourceId: block.id,
      metadata: { unblockedUserId: block.blockedUserId },
    });

    return { success: true };
  }

  /**
   * Bidirectional block check — returns `true` if either user has blocked the other.
   * Intended for use by other modules (e.g., to gate messaging or likes). No side effects.
   *
   * @param userAId - ID of the first user in the pair.
   * @param userBId - ID of the second user in the pair.
   * @returns `true` if an active block exists in either direction, `false` otherwise.
   */
  async isBlocked(userAId: string, userBId: string): Promise<boolean> {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerUserId: userAId, blockedUserId: userBId },
          { blockerUserId: userBId, blockedUserId: userAId },
        ],
        deletedAt: null,
      },
      select: { id: true },
    });

    return !!block;
  }

  // Flattens the nested Prisma profile join into the flat BlockedUser shape.
  private mapToResponseDto(block: BlockWithProfile) {
    return {
      id: block.id,
      createdAt: block.createdAt,
      blockedUser: {
        id: block.blocked.id,
        firstName: block.blocked.profile?.firstName,
        lastName: block.blocked.profile?.lastName,
      },
    };
  }
}
