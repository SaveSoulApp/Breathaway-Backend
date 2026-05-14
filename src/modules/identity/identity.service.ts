import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Identity, IdentityType } from '@prisma/client';
import { BaseService } from 'src/base/services/base.service';
import { normalizeIdentityValue } from 'src/common/utils/identity.utils';
import { LoggerService } from 'src/core/logger/logger.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CreateIdentityDto, UpdateIdentityDto } from './dto';
import { IdentityEncryptionService } from './identity-encryption.service';

@Injectable()
export class IdentityService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly encryption: IdentityEncryptionService,
  ) {
    super(logger);
  }

  async create(userId: string, dto: CreateIdentityDto) {
    const publicValueData = await this.processPublicValue(
      dto.publicValue,
      dto.type,
    );
    let platformIdData = {};
    const orConditions: any[] = [
      { publicValueHash: publicValueData.publicValueHash },
    ];

    if (dto.platformId) {
      platformIdData = await this.processPlatformId(dto.platformId);
      orConditions.push({
        platformIdHash: (platformIdData as any).platformIdHash,
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
        const publicValue = await this.encryption.decryptPublicValue(
          identity.publicValueCiphertext,
          identity.publicValueIv,
          identity.publicValueTag,
          identity.publicValueWrappedKey,
          identity.publicValueKeyId,
        );

        let platformId: string | null = null;
        if (
          identity.platformIdCiphertext &&
          identity.platformIdIv &&
          identity.platformIdTag &&
          identity.platformIdWrappedKey &&
          identity.platformIdKeyId
        ) {
          platformId = await this.encryption.decryptPlatformId(
            identity.platformIdCiphertext,
            identity.platformIdIv,
            identity.platformIdTag,
            identity.platformIdWrappedKey,
            identity.platformIdKeyId,
          );
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

    const publicValue = await this.encryption.decryptPublicValue(
      identity.publicValueCiphertext,
      identity.publicValueIv,
      identity.publicValueTag,
      identity.publicValueWrappedKey,
      identity.publicValueKeyId,
    );

    let platformId: string | null = null;
    if (
      identity.platformIdCiphertext &&
      identity.platformIdIv &&
      identity.platformIdTag &&
      identity.platformIdWrappedKey &&
      identity.platformIdKeyId
    ) {
      platformId = await this.encryption.decryptPlatformId(
        identity.platformIdCiphertext,
        identity.platformIdIv,
        identity.platformIdTag,
        identity.platformIdWrappedKey,
        identity.platformIdKeyId,
      );
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

    const orConditions: any[] = [];
    let updateData: any = {};

    if (dto.publicValue) {
      const publicValueData = await this.processPublicValue(
        dto.publicValue,
        identity.type,
      );
      orConditions.push({ publicValueHash: publicValueData.publicValueHash });
      updateData = { ...updateData, ...publicValueData };
    }

    if (dto.platformId) {
      const platformIdData = await this.processPlatformId(dto.platformId);
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
        deletedAt: new Date(),
        userId: null,
      },
    });
  }

  async verify(id: string, userId: string) {
    const identity = await this.findOwnedOrFail(id, userId);
    const updated = await this.prisma.identity.update({
      where: { id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
    return this.toMaskedResponse(updated);
  }

  // ----- Private helpers -----

  private async findOwnedOrFail(id: string, userId: string) {
    const identity = await this.prisma.identity.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!identity) {
      throw new NotFoundException(`Identity ${id} not found`);
    }
    return identity;
  }

  private async processPublicValue(value: string, type: IdentityType) {
    const normalized = normalizeIdentityValue(value, type);
    const hash = await this.encryption.computeHash(normalized);
    const encryptedPublicValue =
      await this.encryption.encryptPublicValue(normalized);
    const masked = this.encryption.maskPublicValue(normalized, type);

    return {
      publicValueHash: hash,
      publicValueCiphertext: encryptedPublicValue.ciphertextBase64,
      publicValueIv: encryptedPublicValue.ivBase64,
      publicValueTag: encryptedPublicValue.tagBase64,
      publicValueWrappedKey: encryptedPublicValue.wrappedKeyBase64,
      publicValueKeyId: encryptedPublicValue.keyId,
      publicValueMasked: masked,
    };
  }

  private async processPlatformId(platformId: string) {
    const hash = await this.encryption.computeHash(platformId);
    const encryptedPlatformId =
      await this.encryption.encryptPlatformId(platformId);

    return {
      platformIdHash: hash,
      platformIdCiphertext: encryptedPlatformId.ciphertextBase64,
      platformIdIv: encryptedPlatformId.ivBase64,
      platformIdTag: encryptedPlatformId.tagBase64,
      platformIdWrappedKey: encryptedPlatformId.wrappedKeyBase64,
      platformIdKeyId: encryptedPlatformId.keyId,
    };
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
