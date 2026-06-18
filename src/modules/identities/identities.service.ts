import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Identity, IdentityType, Prisma } from '@prisma/client';
import {
  CreateIdentityDto,
  LookupIdentityRequestDto,
  UpdateIdentityDto,
} from './dto';

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

  async create(userId: string, dto: CreateIdentityDto) {
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
      throw new ConflictException(
        `An identity of type ${dto.type} with this value or platform ID already exists`,
      );
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

  async findAllByUser(userId: string) {
    const identities = await this.prisma.identity.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return identities.map((id) => this.toMaskedResponse(id));
  }

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

  async findOne(id: string, userId: string) {
    const identity = await this.findOwnedOrFail(id, userId);
    return this.toMaskedResponse(identity);
  }

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

  async update(id: string, userId: string, dto: UpdateIdentityDto) {
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

  private async findOwnedOrFail(id: string, userId: string) {
    const identity = await this.prisma.identity.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!identity) {
      throw new NotFoundException(`Identity ${id} not found`);
    }
    return identity;
  }

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
