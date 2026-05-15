import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateBlockDto } from './dto';

@Injectable()
export class BlockService {
  constructor(private readonly prisma: PrismaService) {}

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
          createdAt: new Date(), // Resetting createdAt makes it a "new" block in terms of history/sorting
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

    return this.mapToResponseDto(newBlock);
  }

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

    return {
      data: blocks.map((block) => this.mapToResponseDto(block)),
    };
  }

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
        deletedAt: new Date(),
      },
    });

    return { success: true };
  }

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

  private mapToResponseDto(block: any) {
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
