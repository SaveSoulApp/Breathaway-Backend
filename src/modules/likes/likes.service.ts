import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LikeStatus, Prisma } from '@prisma/client';

import { SortOrder } from '@common/enums';
import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { CreditsService } from '@modules/credits/credits.service';
import { IdentitiesService } from '@modules/identities/identities.service';
import { MatchResolverService } from '@modules/match-resolver/match-resolver.service';

import { LikesConfig } from './config/likes.config';
import {
  CreateLikeRequestDto,
  LikeListQueryDto,
  UpdateLikeLabelRequestDto,
} from './dto';
import { LIKE_SELECT, RawLike } from './likes.types';

/**
 * Manages the full lifecycle of a like — creation, retrieval, label annotation, and soft-deletion.
 *
 * A like represents one user's expressed intent to connect with another person's identity.
 * This service coordinates identity resolution (via IdentityCryptoService and IdentitiesService),
 * duplicate prevention, expiry scheduling, match resolution (via MatchResolverService),
 * and audit logging for every state-changing operation.
 */
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
    private readonly creditsService: CreditsService,
  ) {
    super(logger);
    this.expiryDays = this.configService.get<number>('LIKE_EXPIRY_DAYS', 90);
  }

  /**
   * Records a new like from the authenticated user toward a target identity.
   *
   * When only raw identity data is supplied (`dto.targetIdentity`), the service either
   * resolves an existing identity by its hashed public value or creates a new unresolved
   * one. Duplicate likes (same sender → same target, non-deleted) are rejected.
   * Match resolution is triggered asynchronously after the like is persisted — a failure
   * there is logged but does NOT roll back the like.
   *
   * @param userId - UUID of the authenticated user sending the like.
   * @param dto    - Payload containing the target identity reference, intent, and optional label.
   * @returns The created like with the decrypted target identity `publicValue` attached.
   * @throws {BadRequestException} When neither `targetIdentityId` nor `targetIdentity` is supplied,
   *   or when the user attempts to like an identity that maps to themselves.
   * @throws {NotFoundException} When the resolved `targetIdentityId` does not exist in the database.
   * @throws {ConflictException} When a non-deleted like from this user to the same identity already exists.
   */
  async create(userId: string, dto: CreateLikeRequestDto) {
    const hasSufficient = await this.creditsService.hasSufficientCredits(
      userId,
      LikesConfig.CREDITS_PER_LIKE,
    );

    if (!hasSufficient) {
      this.emitAuditLog({
        actionType: AuditActionType.USAGE_DENIED,
        userId,
        metadata: {
          reason: 'Insufficient credits for like',
          requiredAmount: LikesConfig.CREDITS_PER_LIKE,
        },
      });
      throw new HttpException(
        'Insufficient credits',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

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

    const like = await this.prisma.$transaction(async (tx) => {
      const createdLike = await tx.like.create({
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

      await this.creditsService.consumeCredits(
        {
          userId,
          amount: LikesConfig.CREDITS_PER_LIKE,
          referenceId: createdLike.id,
        },
        tx,
      );

      return createdLike;
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

  /**
   * Returns a paginated, optionally filtered list of likes sent by the given user.
   *
   * Runs a count and a data query in parallel to minimise latency. Each row has its
   * target identity `publicValue` decrypted before being returned, so this method
   * performs one decryption call per row — avoid large `limit` values in hot paths.
   *
   * @param userId - UUID of the user whose likes are being listed.
   * @param query  - Pagination parameters (`page`, `limit`), optional `intent` and `status` filters,
   *                 and `sortOrder` (defaults to DESC).
   * @returns A paginated envelope containing the like rows and cursor metadata.
   */
  async findAllForUser(userId: string, query: LikeListQueryDto) {
    const {
      page = 1,
      limit = 20,
      intent,
      status,
      sortOrder = SortOrder.DESC,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LikeWhereInput = {
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

  /**
   * Fetches a single like by ID, enforcing ownership by the given user.
   *
   * Only non-soft-deleted likes are returned; a deleted like is treated the same
   * as non-existent from the caller's perspective.
   *
   * @param id     - UUID of the like to retrieve.
   * @param userId - UUID of the user who must own the like.
   * @returns The like with decrypted target identity data.
   * @throws {NotFoundException} When no non-deleted like with the given ID exists for this user.
   */
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

  /**
   * Soft-deletes a PENDING like by stamping `deletedAt` and setting status to DELETED.
   *
   * The record is intentionally retained in the database for audit history. Only PENDING
   * likes may be deleted; MATCHED or VOIDED likes must be managed via their own lifecycle
   * endpoints. Emits a LIKE_DELETED audit event on success.
   *
   * @param id     - UUID of the like to delete.
   * @param userId - UUID of the user who must own the like.
   * @returns `{ success: true }` on successful deletion.
   * @throws {NotFoundException} When no non-deleted like with the given ID exists for this user.
   * @throws {BadRequestException} When the like is not in PENDING status.
   */
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

  /**
   * Updates the personal label on a like, regardless of its current status.
   *
   * Labels are a user-facing annotation (e.g. "Sarah from the gym") and are intentionally
   * updateable even after a like has been MATCHED or VOIDED, so users can always personalise
   * their history. Passing `null` in the DTO clears any existing label.
   *
   * @param id     - UUID of the like to update.
   * @param userId - UUID of the user who must own the like.
   * @param dto    - New label value; `null` clears the field.
   * @returns The updated like with decrypted target identity data.
   * @throws {NotFoundException} When no non-deleted like with the given ID exists for this user.
   */
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
