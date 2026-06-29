import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Identity, IdentityType, Prisma } from '@prisma/client';
import {
  CreateIdentityRequestDto,
  LookupIdentityRequestDto,
  UpdateIdentityRequestDto,
} from './dto';

/**
 * Owns the business logic for creating, reading, updating, verifying, and deleting
 * a user's contact identities (phone numbers, email addresses, social handles).
 *
 * **Encryption model**: plaintext `publicValue` and `platformId` are never stored
 * directly. All writes go through `IdentityCryptoService` which produces a ciphertext
 * envelope plus a deterministic HMAC hash used for equality lookups. Only the hash and
 * a masked display string are stored in the clear.
 *
 * This service is exported from `IdentitiesModule` so auth and matching modules can call
 * `claimOrCreateIdentity`, `getDecryptedPublicValue`, and `findByPublicValue` without
 * depending on the full module graph.
 */
@Injectable()
export class IdentitiesService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly encryption: IdentityCryptoService,
    private readonly pubSubPublisher: PubSubPublisherService,
  ) {
    super(logger);
  }

  /**
   * Registers a new identity for a user, or claims an existing unowned record.
   *
   * If an active identity of the same type already exists with a matching `publicValueHash`
   * or `platformIdHash` and has no owner (`userId = null`), the service claims that record
   * by setting the user ID rather than inserting a duplicate row. Owned duplicates are
   * rejected with a `ConflictException`. Emits an `IDENTITY_CREATED` audit log on success.
   *
   * @param userId - UUID of the authenticated user claiming ownership.
   * @param dto    - Identity type, raw public value, and optional platform ID.
   * @returns The created or claimed identity in masked form (no plaintext values).
   * @throws {ConflictException} When an active identity with the same type and value or
   *   platform ID is already owned by another user.
   */
  async create(userId: string, dto: CreateIdentityRequestDto) {
    const publicValueData = await this.encryption.processPublicValue(
      dto.publicValue,
      dto.type,
    );
    let platformIdData: Partial<
      Awaited<ReturnType<IdentityCryptoService['processPlatformId']>>
    > = {};
    const orConditions: Prisma.IdentityWhereInput[] = [
      { publicValueHash: publicValueData.publicValueHash },
    ];

    if (dto.platformId) {
      const processed = await this.encryption.processPlatformId(dto.platformId);
      platformIdData = processed;
      orConditions.push({
        platformIdHash: processed.platformIdHash,
      });
    }

    // Check for existing active identity of same type & hash
    const existing = await this.prisma.identity.findFirst({
      where: {
        type: dto.type,
        OR: orConditions,
        deletedAt: null,
      },
    });
    if (existing) {
      if (existing.userId !== null) {
        throw new ConflictException(
          `An identity of type ${dto.type} with this value or platform ID already exists`,
        );
      }

      const updated = await this.prisma.identity.update({
        where: { id: existing.id },
        data: {
          userId,
          isVerified: false,
          ...publicValueData,
          ...platformIdData,
        },
      });

      this.emitAuditLog({
        actionType: AuditActionType.IDENTITY_CREATED,
        userId: userId,
        resourceId: updated.id,
        metadata: {
          identityType: updated.type,
          maskedValue: updated.publicValueMasked,
          publicValueHash: updated.publicValueHash,
        },
      });

      return this.toMaskedResponse(updated);
    }

    const identity = await this.prisma.identity.create({
      data: {
        type: dto.type,
        userId,
        isVerified: false,
        ...publicValueData,
        ...platformIdData,
      },
    });

    this.emitAuditLog({
      actionType: AuditActionType.IDENTITY_CREATED,
      userId: userId,
      resourceId: identity.id,
      metadata: {
        identityType: identity.type,
        maskedValue: identity.publicValueMasked,
        publicValueHash: identity.publicValueHash,
      },
    });

    return this.toMaskedResponse(identity);
  }

  /**
   * Lists all non-deleted identities belonging to the given user, ordered by creation date.
   *
   * Returns masked representations only — no decryption is performed.
   *
   * @param userId - UUID of the user whose identities to list.
   * @returns Array of masked identity objects, newest first.
   */
  async findAllByUser(userId: string) {
    const identities = await this.prisma.identity.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return identities.map((id) => this.toMaskedResponse(id));
  }

  /**
   * Lists all non-deleted identities for the user with plaintext values decrypted.
   *
   * Decrypts both `publicValue` and `platformId` (when present) for every row via the
   * crypto service — cost scales linearly with the number of identities. Avoid calling
   * this in tight loops or background jobs that process many users.
   *
   * @param userId - UUID of the user whose complete identities to list.
   * @returns Array of complete identity objects including decrypted `publicValue` and `platformId`.
   */
  async findAllCompleteByUser(userId: string) {
    const identities = await this.prisma.identity.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      identities.map(async (identity) => {
        const publicValue = await this.encryption.decryptPublicValue({
          publicValueCiphertext: identity.publicValueCiphertext,
          publicValueIv: identity.publicValueIv,
          publicValueTag: identity.publicValueTag,
          publicValueWrappedKey: identity.publicValueWrappedKey,
          publicValueKeyId: identity.publicValueKeyId,
        });

        let platformId: string | null = null;
        if (
          identity.platformIdCiphertext &&
          identity.platformIdIv &&
          identity.platformIdTag &&
          identity.platformIdWrappedKey &&
          identity.platformIdKeyId
        ) {
          platformId = await this.encryption.decryptPlatformId({
            platformIdCiphertext: identity.platformIdCiphertext,
            platformIdIv: identity.platformIdIv,
            platformIdTag: identity.platformIdTag,
            platformIdWrappedKey: identity.platformIdWrappedKey,
            platformIdKeyId: identity.platformIdKeyId,
          });
        }

        return {
          ...this.toMaskedResponse(identity),
          publicValue,
          platformId,
        };
      }),
    );
  }

  /**
   * Retrieves a single identity by ID in masked form, enforcing ownership.
   *
   * @param id     - UUID of the identity.
   * @param userId - UUID of the user who must own it.
   * @returns Masked identity record.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   */
  async findOne(id: string, userId: string) {
    const identity = await this.findOwnedOrFail(id, userId);
    return this.toMaskedResponse(identity);
  }

  /**
   * Retrieves a single identity by ID with plaintext `publicValue` and `platformId` decrypted.
   *
   * Performs live decryption; values are not cached on the service layer.
   *
   * @param id     - UUID of the identity.
   * @param userId - UUID of the user who must own it.
   * @returns Complete identity record with decrypted values.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   */
  async findOneComplete(id: string, userId: string) {
    const identity = await this.findOwnedOrFail(id, userId);

    const publicValue = await this.encryption.decryptPublicValue({
      publicValueCiphertext: identity.publicValueCiphertext,
      publicValueIv: identity.publicValueIv,
      publicValueTag: identity.publicValueTag,
      publicValueWrappedKey: identity.publicValueWrappedKey,
      publicValueKeyId: identity.publicValueKeyId,
    });

    let platformId: string | null = null;
    if (
      identity.platformIdCiphertext &&
      identity.platformIdIv &&
      identity.platformIdTag &&
      identity.platformIdWrappedKey &&
      identity.platformIdKeyId
    ) {
      platformId = await this.encryption.decryptPlatformId({
        platformIdCiphertext: identity.platformIdCiphertext,
        platformIdIv: identity.platformIdIv,
        platformIdTag: identity.platformIdTag,
        platformIdWrappedKey: identity.platformIdWrappedKey,
        platformIdKeyId: identity.platformIdKeyId,
      });
    }

    return {
      ...this.toMaskedResponse(identity),
      publicValue,
      platformId,
    };
  }

  /**
   * Updates the `publicValue` and/or `platformId` of an owned identity.
   *
   * If neither field is provided the existing record is returned unchanged without a DB write.
   * Before writing, duplicate detection checks all other active identities of the same type.
   * Changing `publicValue` does NOT automatically reset `isVerified` here — the caller is
   * responsible for triggering re-verification if required by product policy.
   *
   * @param id     - UUID of the identity to update.
   * @param userId - UUID of the user who must own it.
   * @param dto    - Fields to update; at least one of `publicValue` or `platformId` must be set
   *                 for any write to occur.
   * @returns The updated identity in masked form.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   * @throws {ConflictException} When another active identity of the same type already holds the
   *   supplied value or platform ID.
   */
  async update(id: string, userId: string, dto: UpdateIdentityRequestDto) {
    const identity = await this.findOwnedOrFail(id, userId);

    if (!dto.publicValue && !dto.platformId) {
      return this.toMaskedResponse(identity);
    }

    const orConditions: Prisma.IdentityWhereInput[] = [];
    let updateData: Prisma.IdentityUpdateInput = {};

    if (dto.publicValue) {
      const publicValueData = await this.encryption.processPublicValue(
        dto.publicValue,
        identity.type,
      );
      orConditions.push({ publicValueHash: publicValueData.publicValueHash });
      updateData = { ...updateData, ...publicValueData };
    }

    if (dto.platformId) {
      const platformIdData = await this.encryption.processPlatformId(
        dto.platformId,
      );
      orConditions.push({ platformIdHash: platformIdData.platformIdHash });
      updateData = { ...updateData, ...platformIdData };
    }

    if (orConditions.length > 0) {
      const duplicate = await this.prisma.identity.findFirst({
        where: {
          type: identity.type,
          deletedAt: null,
          id: { not: id },
          OR: orConditions,
        },
      });
      if (duplicate) {
        throw new ConflictException(
          `Another identity of type ${identity.type} with this value or platform ID already exists`,
        );
      }
    }

    const updated = await this.prisma.identity.update({
      where: { id },
      data: updateData,
    });

    return this.toMaskedResponse(updated);
  }

  /**
   * Soft-deletes an identity by stamping `deletedAt` and setting `userId` to null.
   *
   * Nulling `userId` means the identity becomes reclaimable by any user who presents
   * the same public value in the future, preventing permanent orphaning of hashed records.
   *
   * @param id     - UUID of the identity to delete.
   * @param userId - UUID of the user who must own it.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   */
  async delete(id: string, userId: string) {
    await this.findOwnedOrFail(id, userId);
    await this.prisma.identity.update({
      where: { id },
      data: {
        deletedAt: DateUtil.now(),
        userId: null,
      },
    });
  }

  /**
   * Sets `isVerified = true` and records `verifiedAt` on the identity.
   *
   * Emits an `IDENTITY_VERIFIED` audit log event after the DB write. In production this
   * should only be called after an out-of-band confirmation (OTP, OAuth); calling it directly
   * bypasses the verification challenge.
   *
   * @param id     - UUID of the identity to verify.
   * @param userId - UUID of the user who must own it.
   * @returns The updated identity in masked form with `isVerified: true`.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   */
  async verify(id: string, userId: string) {
    await this.findOwnedOrFail(id, userId);
    const updated = await this.prisma.identity.update({
      where: { id },
      data: {
        isVerified: true,
        verifiedAt: DateUtil.now(),
      },
    });

    this.emitAuditLog({
      actionType: AuditActionType.IDENTITY_VERIFIED,
      userId: userId,
      resourceId: updated.id,
      metadata: {
        identityType: updated.type,
        maskedValue: updated.publicValueMasked,
        publicValueHash: updated.publicValueHash,
      },
    });

    return this.toMaskedResponse(updated);
  }

  /**
   * Atomically claims or creates a fully-verified identity for a user, used by OAuth flows.
   *
   * Looks up an existing identity by type + public value hash. If found and unowned (or
   * already owned by this user), it is updated with the new crypto data and marked verified.
   * If no record exists, a new verified identity is created. In both cases an
   * `IDENTITY_CLAIMED` Pub/Sub event is published (fire-and-forget) to trigger async
   * match resolution, and an `IDENTITY_VERIFIED` audit log is emitted.
   *
   * @param type        - Category of the identity (e.g. `INSTAGRAM`, `PHONE`).
   * @param publicValue - Plaintext value returned by the OAuth provider.
   * @param platformId  - Provider-issued numeric ID (stable across handle changes).
   * @param userId      - UUID of the user claiming the identity.
   * @returns The claimed or created identity in masked form.
   * @throws {ConflictException} When the identity already belongs to a different user.
   */
  async claimOrCreateIdentity(
    type: IdentityType,
    publicValue: string,
    platformId: string,
    userId: string,
  ) {
    const publicValueData = await this.encryption.processPublicValue(
      publicValue,
      type,
    );
    const platformIdData = await this.encryption.processPlatformId(platformId);

    const existing = await this.prisma.identity.findFirst({
      where: {
        type,
        publicValueHash: publicValueData.publicValueHash,
        deletedAt: null,
      },
    });

    if (existing) {
      if (existing.userId && existing.userId !== userId) {
        throw new ConflictException('Identity already claimed by another user');
      }

      const updated = await this.prisma.identity.update({
        where: { id: existing.id },
        data: {
          userId,
          isVerified: true,
          verifiedAt: DateUtil.now(),
          ...publicValueData,
          ...platformIdData,
        },
      });

      this.publishIdentityClaimedEvent(userId);

      this.emitAuditLog({
        actionType: AuditActionType.IDENTITY_VERIFIED,
        userId: userId,
        resourceId: updated.id,
        metadata: {
          identityType: updated.type,
          maskedValue: updated.publicValueMasked,
          publicValueHash: updated.publicValueHash,
        },
      });

      return this.toMaskedResponse(updated);
    }

    const identity = await this.prisma.identity.create({
      data: {
        type,
        userId,
        isVerified: true,
        verifiedAt: DateUtil.now(),
        ...publicValueData,
        ...platformIdData,
      },
    });

    this.publishIdentityClaimedEvent(userId);

    this.emitAuditLog({
      actionType: AuditActionType.IDENTITY_VERIFIED,
      userId: userId,
      resourceId: identity.id,
      metadata: {
        identityType: identity.type,
        maskedValue: identity.publicValueMasked,
        publicValueHash: identity.publicValueHash,
      },
    });

    return this.toMaskedResponse(identity);
  }

  /**
   * Resolves an identity by its raw public value, scoped to a specific user.
   *
   * Hashes the incoming plaintext to produce the lookup key, then decrypts the stored
   * ciphertext to return the original value. Useful for clients that know the contact
   * value (e.g. from a local contacts scan) but need the internal identity ID.
   *
   * @param userId - UUID of the user who must own the identity.
   * @param dto    - Identity type and raw public value to look up.
   * @returns The complete identity record with decrypted `publicValue` and `platformId`.
   * @throws {NotFoundException} When no identity matching the type + value exists for this user.
   */
  async findByPublicValue(userId: string, dto: LookupIdentityRequestDto) {
    const { publicValueHash } = await this.encryption.processPublicValue(
      dto.publicValue,
      dto.type,
    );

    const identity = await this.prisma.identity.findFirst({
      where: { type: dto.type, publicValueHash, userId, deletedAt: null },
    });

    if (!identity) {
      throw new NotFoundException(
        `No ${dto.type} identity with the provided value found for this user`,
      );
    }

    const publicValue = await this.encryption.decryptPublicValue({
      publicValueCiphertext: identity.publicValueCiphertext,
      publicValueIv: identity.publicValueIv,
      publicValueTag: identity.publicValueTag,
      publicValueWrappedKey: identity.publicValueWrappedKey,
      publicValueKeyId: identity.publicValueKeyId,
    });

    let platformId: string | null = null;
    if (
      identity.platformIdCiphertext &&
      identity.platformIdIv &&
      identity.platformIdTag &&
      identity.platformIdWrappedKey &&
      identity.platformIdKeyId
    ) {
      platformId = await this.encryption.decryptPlatformId({
        platformIdCiphertext: identity.platformIdCiphertext,
        platformIdIv: identity.platformIdIv,
        platformIdTag: identity.platformIdTag,
        platformIdWrappedKey: identity.platformIdWrappedKey,
        platformIdKeyId: identity.platformIdKeyId,
      });
    }

    return {
      ...this.toMaskedResponse(identity),
      publicValue,
      platformId,
    };
  }

  // ----- Private helpers -----

  /**
   * Publishes an IDENTITY_CLAIMED event to Pub/Sub to trigger async match resolution
   * for the newly claiming user. The publish is fire-and-forget — Pub/Sub provides
   * the durability and retry guarantees, so we only log on failure.
   */
  private publishIdentityClaimedEvent(userId: string): void {
    this.pubSubPublisher
      .publish(PubSubTopic.IDENTITY_WORKFLOWS, PubSubEvent.IDENTITY_CLAIMED, {
        userId,
      })
      .catch((err: Error) => {
        this.logger.error(
          `Failed to publish ${PubSubEvent.IDENTITY_CLAIMED} event for user ${userId}`,
          { error: err.message },
        );
      });
  }

  /**
   * Decrypts and returns the plaintext `publicValue` for a given identity by ID.
   *
   * Called by the LikesService to attach the decrypted identity value to like responses
   * without going through the full identity ownership check (likes already enforce scope).
   *
   * @param identityId - UUID of the identity to decrypt.
   * @returns The decrypted plaintext public value string.
   * @throws {NotFoundException} When no identity with the given ID exists in the database.
   */
  async getDecryptedPublicValue(identityId: string): Promise<string> {
    const identity = await this.prisma.identity.findUnique({
      where: { id: identityId },
    });

    if (!identity) {
      throw new NotFoundException(`Identity ${identityId} not found`);
    }

    return this.encryption.decryptPublicValue({
      publicValueCiphertext: identity.publicValueCiphertext,
      publicValueIv: identity.publicValueIv,
      publicValueTag: identity.publicValueTag,
      publicValueWrappedKey: identity.publicValueWrappedKey,
      publicValueKeyId: identity.publicValueKeyId,
    });
  }

  /**
   * Fetches an identity by ID, scoped to the given user, and throws if not found.
   *
   * Centralises the ownership + existence check used by `findOne`, `findOneComplete`,
   * `update`, `delete`, and `verify` to avoid repeating the same Prisma query.
   *
   * @param id     - UUID of the identity.
   * @param userId - UUID of the user who must own it.
   * @throws {NotFoundException} When no non-deleted identity with the given ID exists for this user.
   */
  private async findOwnedOrFail(id: string, userId: string) {
    const identity = await this.prisma.identity.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!identity) {
      throw new NotFoundException(`Identity ${id} not found`);
    }
    return identity;
  }

  /**
   * Projects a full Prisma `Identity` record into the safe masked shape returned by most endpoints.
   *
   * Deliberately excludes all ciphertext, IV, tag, wrapped-key, and key-ID fields so they
   * are never accidentally serialised into an HTTP response.
   */
  private toMaskedResponse(identity: Identity) {
    return {
      id: identity.id,
      type: identity.type,
      publicValueMasked: identity.publicValueMasked,
      isVerified: identity.isVerified,
      verifiedAt: identity.verifiedAt,
      createdAt: identity.createdAt,
      deletedAt: identity.deletedAt,
      userId: identity.userId,
    };
  }
}
