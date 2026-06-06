import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { MatchResolverService } from '@modules/match-resolver/match-resolver.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LikeStatus } from '@prisma/client';
import { CreateLikeRequestDto } from './dto/request/create-like.request.dto';
import { LikeListQueryDto } from './dto/request/like-list-query.request.dto';

@Injectable()
export class LikesService extends BaseService {
  private readonly expiryDays: number;

  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly identityCryptoService: IdentityCryptoService,
    private readonly matchResolverService: MatchResolverService,
  ) {
    super(logger);
    this.expiryDays = this.configService.get<number>('LIKE_EXPIRY_DAYS', 90);
  }

  async create(userId: string, dto: CreateLikeRequestDto) {
    let targetIdentityId = dto.targetIdentityId;

    if (!targetIdentityId && dto.targetIdentity) {
      const { type, publicValue, platformId } = dto.targetIdentity;
      const publicValueData =
        await this.identityCryptoService.processPublicValue(publicValue, type);

      // Check if identity exists
      const existing = await this.prisma.identity.findUnique({
        where: {
          type_publicValueHash: {
            type,
            publicValueHash: publicValueData.publicValueHash,
          },
        },
      });

      if (existing) {
        targetIdentityId = existing.id;
      } else {
        // Create new unresolved identity
        let platformIdData = {};
        if (platformId) {
          platformIdData =
            await this.identityCryptoService.processPlatformId(platformId);
        }

        const newIdentity = await this.prisma.identity.create({
          data: {
            type,
            isVerified: false,
            userId: null,
            ...publicValueData,
            ...platformIdData,
          },
        });
        targetIdentityId = newIdentity.id;
      }
    }

    if (!targetIdentityId) {
      throw new BadRequestException(
        'Either targetIdentityId or targetIdentity must be provided',
      );
    }

    const targetIdentity = await this.prisma.identity.findUnique({
      where: { id: targetIdentityId },
    });

    if (!targetIdentity) {
      throw new NotFoundException('Target identity not found');
    }

    if (targetIdentity.userId === userId) {
      throw new BadRequestException('You cannot like yourself');
    }

    // Prevent duplicate
    const existingLike = await this.prisma.like.findFirst({
      where: {
        senderUserId: userId,
        targetIdentityId,
        deletedAt: null,
        status: { not: LikeStatus.DELETED },
      },
    });

    if (existingLike) {
      throw new ConflictException({ message: 'You already liked this person' });
    }

    const expiresAt = DateUtil.now();
    expiresAt.setDate(expiresAt.getDate() + this.expiryDays);

    const like = await this.prisma.like.create({
      data: {
        senderUserId: userId,
        targetIdentityId,
        targetUserId: targetIdentity.userId,
        intent: dto.intent,
        status: LikeStatus.PENDING,
        expiresAt,
      },
      select: {
        id: true,
        senderUserId: true,
        targetUserId: true,
        intent: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        targetIdentity: {
          select: {
            id: true,
            type: true,
            publicValueMasked: true,
            isVerified: true,
            verifiedAt: true,
          },
        },
      },
    });

    // Trigger match resolution asynchronously in the background
    this.matchResolverService.resolveFromLike(like).catch((err) => {
      this.logger.error(`Match resolution failed for Like ${like.id}`, {
        stack: (err as { stack?: string }).stack,
      });
    });

    return like;
  }

  async findAllForUser(userId: string, query: LikeListQueryDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      senderUserId: userId,
      status: LikeStatus.PENDING,
      deletedAt: null,
    };

    const [total, data] = await Promise.all([
      this.prisma.like.count({ where }),
      this.prisma.like.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          intent: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          targetIdentity: {
            select: {
              id: true,
              type: true,
              publicValueMasked: true,
              isVerified: true,
              verifiedAt: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findOneForUser(id: string, userId: string) {
    const like = await this.prisma.like.findFirst({
      where: {
        id,
        senderUserId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        intent: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        targetIdentity: {
          select: {
            id: true,
            type: true,
            publicValueMasked: true,
            isVerified: true,
            verifiedAt: true,
          },
        },
      },
    });

    if (!like) {
      throw new NotFoundException(`Like ${id} not found`);
    }

    return like;
  }

  async delete(id: string, userId: string) {
    const like = await this.prisma.like.findFirst({
      where: { id, senderUserId: userId, deletedAt: null },
    });

    if (!like) {
      throw new NotFoundException(`Like ${id} not found`);
    }

    if (like.status !== LikeStatus.PENDING) {
      throw new BadRequestException('Only PENDING likes can be deleted');
    }

    await this.prisma.like.update({
      where: { id },
      data: {
        deletedAt: DateUtil.now(),
        status: LikeStatus.DELETED,
      },
    });

    return { success: true };
  }
}
