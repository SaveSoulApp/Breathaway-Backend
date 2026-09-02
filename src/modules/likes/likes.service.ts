import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityType, LikeStatus, MatchStatus, Prisma } from '@prisma/client';
import {
  AlreadyLikedException,
  AlreadyMatchedException,
  IdentityNotFoundException,
  InsufficientCreditsException,
  InvalidLikeStateException,
  LikeNotFoundException,
  MissingTargetIdentityException,
  SelfLikeException,
} from './application/exceptions';

import { SortOrder } from '@common/enums';
import { DateUtil, dayjs } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { isE164Phone } from '@common/utils/identity.utils';
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
import { LIKE_SELECT, RawLike, CreateLikeResult } from './likes.types';

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
   * Evaluates if a like can be successfully created without actually creating it or consuming credits.
   * Throws the corresponding domain exceptions if validation fails.
   */
  async canCreate(
    userId: string,
    dto: CreateLikeRequestDto,
  ): Promise<{ canCreate: boolean }> {
    const ctx = { userId, targetIdentityId: dto.targetIdentityId };
    this.logger.debug('Like can-create check started', {
      ...ctx,
      step: 'init',
    });

    let targetIdentityId = dto.targetIdentityId;

    if (!targetIdentityId && dto.targetIdentity) {
      const { type, publicValue } = dto.targetIdentity;
      const resolvedPublicValue =
        type === IdentityType.PHONE
          ? await this.resolvePhoneWithCountryCode(publicValue, userId)
          : publicValue;
      const publicValueData =
        await this.identityCryptoService.processPublicValue(
          resolvedPublicValue,
          type,
        );

      const existing = await this.prisma.identity.findUnique({
        where: {
          type_publicValueHash: {
            type,
            publicValueHash: publicValueData.publicValueHash,
          },
        },
      });

      if (!existing) {
        // Identity doesn't exist in our DB yet -> can't be already liked or matched.
        return { canCreate: true };
      }
      targetIdentityId = existing.id;
    }

    if (!targetIdentityId) {
      throw new MissingTargetIdentityException();
    }

    const targetIdentity = await this.prisma.identity.findUnique({
      where: { id: targetIdentityId },
    });

    if (!targetIdentity) {
      throw new IdentityNotFoundException();
    }

    if (targetIdentity.userId === userId) {
      throw new SelfLikeException();
    }

    const existingLike = await this.prisma.like.findFirst({
      where: {
        senderUserId: userId,
        targetIdentityId,
        deletedAt: null,
        // Only an in-flight PENDING like blocks re-liking.
        // WITHDRAWN (initiator of an unmatch) and VOIDED (other party) are
        // terminal system-set states that must allow a fresh like — the upsert
        // path in create() will update those rows rather than inserting a new one.
        // MATCHED is implicitly blocked by the AlreadyMatchedException guard below.
        status: LikeStatus.PENDING,
      },
    });

    if (existingLike) {
      throw new AlreadyLikedException();
    }

    if (targetIdentity.userId) {
      const [userOneId, userTwoId] = [userId, targetIdentity.userId].sort();
      const existingMatch = await this.prisma.match.findUnique({
        where: { userOneId_userTwoId: { userOneId, userTwoId } },
      });

      if (existingMatch && existingMatch.status === MatchStatus.ACTIVE) {
        throw new AlreadyMatchedException();
      }
    }

    return { canCreate: true };
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
  async create(
    userId: string,
    dto: CreateLikeRequestDto,
    timezone?: string,
  ): Promise<CreateLikeResult> {
    const ctx = { userId, targetIdentityId: dto.targetIdentityId };
    this.logger.log('Like creation started', { ...ctx, step: 'init' });

    // Step 1: Credit check
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
      this.logger.warn('Like creation failed: insufficient credits', {
        ...ctx,
        step: 'credit_check',
        requiredAmount: LikesConfig.CREDITS_PER_LIKE,
      });
      throw new InsufficientCreditsException();
    }

    this.logger.debug('Credit check passed', {
      ...ctx,
      step: 'credit_check',
      requiredAmount: LikesConfig.CREDITS_PER_LIKE,
    });

    // Step 2: Identity resolution
    let targetIdentityId = dto.targetIdentityId;

    if (!targetIdentityId && dto.targetIdentity) {
      const { type, publicValue, platformId } = dto.targetIdentity;

      // Normalise phone numbers to E.164 before hashing/encrypting so that a number
      // submitted without a country code resolves to the same identity row as the
      // same number submitted with a country code.
      const resolvedPublicValue =
        type === IdentityType.PHONE
          ? await this.resolvePhoneWithCountryCode(publicValue, userId)
          : publicValue;

      const publicValueData =
        await this.identityCryptoService.processPublicValue(
          resolvedPublicValue,
          type,
        );

      this.logger.debug('Public value hashed, looking up existing identity', {
        ...ctx,
        step: 'identity_resolution',
        identityType: type,
      });

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
        this.logger.debug('Resolved to existing identity', {
          ...ctx,
          step: 'identity_resolution',
          resolvedIdentityId: existing.id,
        });
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
        this.logger.log('New unresolved identity created', {
          ...ctx,
          step: 'identity_resolution',
          newIdentityId: newIdentity.id,
          identityType: type,
        });
      }
    }

    if (!targetIdentityId) {
      this.logger.warn('Like creation failed: missing target identity', {
        ...ctx,
        step: 'identity_resolution',
      });
      throw new MissingTargetIdentityException();
    }

    // Step 3: Target identity validation
    const targetIdentity = await this.prisma.identity.findUnique({
      where: { id: targetIdentityId },
    });

    if (!targetIdentity) {
      this.logger.warn('Like creation failed: target identity not found', {
        ...ctx,
        step: 'identity_validation',
        targetIdentityId,
      });
      throw new IdentityNotFoundException();
    }

    if (targetIdentity.userId === userId) {
      this.logger.warn('Like creation failed: cannot like self', {
        ...ctx,
        step: 'identity_validation',
        targetIdentityId,
      });
      throw new SelfLikeException();
    }

    this.logger.debug('Target identity validated', {
      ...ctx,
      step: 'identity_validation',
      targetIdentityId,
    });

    // Step 4: Duplicate check — only a live PENDING like is a hard block.
    const existingPendingLike = await this.prisma.like.findFirst({
      where: {
        senderUserId: userId,
        targetIdentityId,
        deletedAt: null,
        // Only an in-flight PENDING like blocks re-liking.
        // WITHDRAWN (initiator of an unmatch) and VOIDED (other party) are
        // terminal system-set states that must allow a fresh like — the upsert
        // path below will update those rows rather than inserting a new one.
        // MATCHED is implicitly blocked by the AlreadyMatchedException guard above.
        status: LikeStatus.PENDING,
      },
    });

    if (existingPendingLike) {
      this.logger.warn('Like creation failed: already liked', {
        ...ctx,
        step: 'duplicate_check',
        targetIdentityId,
        existingLikeId: existingPendingLike.id,
      });
      throw new AlreadyLikedException();
    }

    // Step 4.5: Detect an existing WITHDRAWN or VOIDED row for the same pair.
    // The @@unique([senderUserId, targetIdentityId]) constraint means we cannot
    // INSERT a new row — we must UPDATE the existing one back to PENDING instead.
    const reusableLike = await this.prisma.like.findFirst({
      where: {
        senderUserId: userId,
        targetIdentityId,
        deletedAt: null,
        status: { in: [LikeStatus.WITHDRAWN, LikeStatus.VOIDED] },
      },
      select: { id: true },
    });

    this.logger.debug('Duplicate and reusable-like check passed', {
      ...ctx,
      step: 'duplicate_check',
      targetIdentityId,
      willUpsert: reusableLike !== null,
      reusableLikeId: reusableLike?.id ?? null,
    });

    // Step 4.6: Active Match Check
    if (targetIdentity.userId) {
      const [userOneId, userTwoId] = [userId, targetIdentity.userId].sort();
      const existingMatch = await this.prisma.match.findUnique({
        where: { userOneId_userTwoId: { userOneId, userTwoId } },
      });

      if (existingMatch && existingMatch.status === MatchStatus.ACTIVE) {
        this.logger.warn('Like creation failed: active match already exists', {
          ...ctx,
          step: 'match_check',
          targetUserId: targetIdentity.userId,
          existingMatchId: existingMatch.id,
        });
        throw new AlreadyMatchedException();
      }

      this.logger.debug('Match check passed', {
        ...ctx,
        step: 'match_check',
        targetUserId: targetIdentity.userId,
      });
    }

    // Step 5: Persist like + deduct credits atomically.
    // Two paths:
    //   a) Upsert — an existing WITHDRAWN/VOIDED row is updated back to PENDING
    //      with a fresh expiresAt, intent, and label. The row ID is preserved so
    //      any existing references (audit history, match links) remain intact.
    //   b) Insert — no prior row exists, create a new one as before.
    let expiresAt = DateUtil.now();
    if (timezone) {
      expiresAt = dayjs
        .tz(DateUtil.now(), timezone)
        .add(this.expiryDays, 'day')
        .endOf('day')
        .toDate();
    } else {
      expiresAt.setDate(expiresAt.getDate() + this.expiryDays);
    }

    let like: CreateLikeResult;

    try {
      like = await this.prisma.$transaction(async (tx) => {
        let persistedLike: CreateLikeResult;

        if (reusableLike) {
          // Path a: update the existing WITHDRAWN/VOIDED row.
          persistedLike = await tx.like.update({
            where: { id: reusableLike.id },
            data: {
              intent: dto.intent,
              status: LikeStatus.PENDING,
              label: dto.label ?? null,
              expiresAt,
              deletedAt: null,
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

          this.logger.debug('Existing like row upserted to PENDING', {
            ...ctx,
            step: 'persist_like',
            likeId: persistedLike.id,
            targetIdentityId,
            previousStatus: 'WITHDRAWN_OR_VOIDED',
          });
        } else {
          // Path b: no prior row — insert fresh.
          persistedLike = await tx.like.create({
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

          this.logger.debug('Like record persisted within transaction', {
            ...ctx,
            step: 'persist_like',
            likeId: persistedLike.id,
            targetIdentityId,
          });
        }

        await this.creditsService.consumeCredits(
          {
            userId,
            amount: LikesConfig.CREDITS_PER_LIKE,
            referenceId: persistedLike.id,
          },
          tx,
        );

        this.logger.debug('Credits deducted within transaction', {
          ...ctx,
          step: 'deduct_credits',
          likeId: persistedLike.id,
          creditsConsumed: LikesConfig.CREDITS_PER_LIKE,
        });

        return persistedLike;
      });
    } catch (err) {
      this.logger.error('Like creation transaction failed', {
        ...ctx,
        step: 'persist_and_deduct',
        targetIdentityId,
        err: serializeError(err),
      });
      throw err;
    }

    // Step 6: Async match resolution (non-fatal)
    this.matchResolverService.resolveFromLike(like).catch((err) => {
      this.logger.error('Match resolution failed after like creation', {
        ...ctx,
        step: 'match_resolution',
        likeId: like.id,
        err: serializeError(err),
      });
    });

    this.logger.debug('Match resolution triggered asynchronously', {
      ...ctx,
      step: 'match_resolution',
      likeId: like.id,
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

    this.logger.log('Like created successfully', {
      ...ctx,
      step: 'complete',
      likeId: like.id,
      targetIdentityId: targetIdentity.id,
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
    const ctx = { userId, page, limit };

    this.logger.debug('Fetching likes for user', {
      ...ctx,
      intent,
      status,
      sortOrder,
    });

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

    this.logger.debug('Likes query completed', {
      ...ctx,
      total,
      returnedCount: rows.length,
    });

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
    const ctx = { likeId: id, userId };
    this.logger.debug('Fetching single like', ctx);

    const like = await this.prisma.like.findFirst({
      where: {
        id,
        senderUserId: userId,
        deletedAt: null,
      },
      select: LIKE_SELECT,
    });

    if (!like) {
      this.logger.warn('Like not found', ctx);
      throw new LikeNotFoundException(id);
    }

    this.logger.debug('Like found', { ...ctx, status: like.status });
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
    const ctx = { likeId: id, userId };
    this.logger.log('Like deletion started', { ...ctx, step: 'init' });

    const like = await this.prisma.like.findFirst({
      where: { id, senderUserId: userId, deletedAt: null },
    });

    if (!like) {
      this.logger.warn('Like not found for deletion', {
        ...ctx,
        step: 'fetch',
      });
      throw new LikeNotFoundException(id);
    }

    if (like.status !== LikeStatus.PENDING) {
      this.logger.warn('Like deletion failed: invalid status', {
        ...ctx,
        step: 'status_check',
        currentStatus: like.status,
        requiredStatus: LikeStatus.PENDING,
      });
      throw new InvalidLikeStateException();
    }

    this.logger.debug('Like status valid for deletion', {
      ...ctx,
      step: 'status_check',
      status: like.status,
    });

    try {
      await this.prisma.like.update({
        where: { id },
        data: {
          deletedAt: DateUtil.now(),
          status: LikeStatus.DELETED,
        },
      });
      this.logger.debug('Like record marked deleted', {
        ...ctx,
        step: 'persist_delete',
      });
    } catch (error) {
      this.logger.error('Failed to soft-delete like', {
        ...ctx,
        step: 'persist_delete',
        err: serializeError(error),
      });
      throw error;
    }

    this.emitAuditLog({
      actionType: AuditActionType.LIKE_DELETED,
      userId: userId,
      resourceId: id,
    });

    this.logger.log('Like soft-deleted successfully', {
      ...ctx,
      step: 'complete',
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
    const ctx = { likeId: id, userId };
    this.logger.log('Like label update started', {
      ...ctx,
      step: 'init',
      hasLabel: dto.label !== null && dto.label !== undefined,
    });

    const like = await this.prisma.like.findFirst({
      where: { id, senderUserId: userId, deletedAt: null },
    });

    if (!like) {
      this.logger.warn('Like not found for label update', {
        ...ctx,
        step: 'fetch',
      });
      throw new LikeNotFoundException(id);
    }

    this.logger.debug('Like found for label update', {
      ...ctx,
      step: 'fetch',
      currentStatus: like.status,
    });

    // Deliberately allow label updates on any non-deleted status (PENDING, MATCHED, VOIDED)
    // so the user can always personalise their history
    let updated;
    try {
      updated = await this.prisma.like.update({
        where: { id },
        data: { label: dto.label ?? null },
        select: LIKE_SELECT,
      });
      this.logger.debug('Like label record updated', {
        ...ctx,
        step: 'persist_label',
      });
    } catch (error) {
      this.logger.error('Failed to update like label', {
        ...ctx,
        step: 'persist_label',
        err: serializeError(error),
      });
      throw error;
    }

    this.logger.log('Like label updated successfully', {
      ...ctx,
      step: 'complete',
      labelCleared: dto.label === null || dto.label === undefined,
    });
    return this.attachPublicValue(updated);
  }

  // ----- Private helpers -----

  /**
   * Ensures a raw phone number is in E.164 format before it is hashed and encrypted.
   *
   * When `rawPhone` already starts with `+` and has the correct digit count it is returned
   * unchanged — no database round-trip is performed. When the country code is absent the
   * method fetches the sender's own verified PHONE identity via `IdentitiesService`,
   * extracts its country code prefix, and prepends it. If the sender has no verified
   * PHONE identity the original value is returned as-is (graceful degradation).
   *
   * @param rawPhone - Phone number as supplied by the client (may or may not include country code).
   * @param userId   - UUID of the authenticated user sending the like.
   * @returns The phone number in E.164 format, or unchanged if enrichment is not possible.
   */
  private async resolvePhoneWithCountryCode(
    rawPhone: string,
    userId: string,
  ): Promise<string> {
    if (isE164Phone(rawPhone)) {
      // Already fully qualified — no enrichment needed and no DB call required.
      return rawPhone;
    }

    const countryCode =
      await this.identitiesService.getSenderCountryCode(userId);

    if (!countryCode) {
      this.logger.warn(
        'Phone country code enrichment skipped: sender has no verified PHONE identity',
        { userId, step: 'country_code_enrichment' },
      );
      return rawPhone;
    }

    const enriched = `${countryCode}${rawPhone.trim()}`;
    this.logger.debug('Phone number enriched with sender country code', {
      userId,
      step: 'country_code_enrichment',
      countryCode,
    });
    return enriched;
  }

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
