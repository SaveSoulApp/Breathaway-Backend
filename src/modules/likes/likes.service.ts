import { SortOrder } from '@common/enums';
import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';
import { IdentitiesService } from '@modules/identities/identities.service';
import { MatchResolverService } from '@modules/match-resolver/match-resolver.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LikeStatus } from '@prisma/client';
import {
  CreateLikeRequestDto,
  LikeListQueryDto,
  UpdateLikeLabelRequestDto,
} from './dto';
import { LIKE_SELECT, RawLike } from './likes.types';

@Injectable()
export class LikesService extends BaseService {
  private readonly expiryDays: number;

  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly identityCryptoService: IdentityCryptoService,
    private readonly identitiesService: IdentitiesService,
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
        intent: dto.intent,
        status: LikeStatus.PENDING,
        label: dto.label ?? null,
        expiresAt,
      },
      select: {
        ...LIKE_SELECT,
        senderUserId: true,
        targetIdentityId: true,
        targetIdentity: {
          select: {
            ...LIKE_SELECT.targetIdentity.select,
            userId: true,
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

    this.emitAuditLog({
      actionType: AuditActionType.LIKE_CREATED,
      userId: userId,
      resourceId: like.id,
      metadata: {
        targetIdentityId: targetIdentity.id,
        targetIdentityType: targetIdentity.type,
        maskedValue: targetIdentity.publicValueMasked,
        publicValueHash: targetIdentity.publicValueHash,
      },
    });

    return this.attachPublicValue(like);
  }

  async findAllForUser(userId: string, query: LikeListQueryDto) {
    const {
      page = 1,
      limit = 20,
      intent,
      status,
      sortOrder = SortOrder.DESC,
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      senderUserId: userId,
    };

    if (intent) {
      where.intent = intent;
    }

    if (status) {
      where.status = status;
    }

    const [total, rows] = await Promise.all([
      this.prisma.like.count({ where }),
      this.prisma.like.findMany({
        where,
        orderBy: { createdAt: sortOrder },
        skip,
        take: limit,
        select: LIKE_SELECT,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const data = await Promise.all(rows.map((r) => this.attachPublicValue(r)));

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
      select: LIKE_SELECT,
    });

    if (!like) {
      throw new NotFoundException(`Like ${id} not found`);
    }

    return this.attachPublicValue(like);
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

    this.emitAuditLog({
      actionType: AuditActionType.LIKE_DELETED,
      userId: userId,
      resourceId: id,
    });

    return { success: true };
  }

  async updateLabel(
    id: string,
    userId: string,
    dto: UpdateLikeLabelRequestDto,
  ) {
    const like = await this.prisma.like.findFirst({
      where: { id, senderUserId: userId, deletedAt: null },
    });

    if (!like) {
      throw new NotFoundException(`Like ${id} not found`);
    }

    // Deliberately allow label updates on any non-deleted status (PENDING, MATCHED, VOIDED)
    // so the user can always personalise their history
    const updated = await this.prisma.like.update({
      where: { id },
      data: { label: dto.label ?? null },
      select: LIKE_SELECT,
    });

    return this.attachPublicValue(updated);
  }

  // ----- Private helpers -----

  /**
   * Delegates publicValue decryption to IdentitiesService (which owns that responsibility)
   * and attaches the result to the targetIdentity shape returned to the controller.
   */
  private async attachPublicValue<T extends RawLike>(like: T) {
    const publicValue = await this.identitiesService.getDecryptedPublicValue(
      like.targetIdentity.id,
    );

    return {
      ...like,
      targetIdentity: {
        ...like.targetIdentity,
        publicValue,
      },
    };
  }
}
