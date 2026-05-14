import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Identity, IdentityType } from '@prisma/client';
import { BaseService } from 'src/base/services/base.service';
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
    super(logger)
  }

  async create(userId: string, dto: CreateIdentityDto) {
    const normalized = this.normalize(dto.publicValue, dto.type);
    const hash = await this.encryption.computeHash(normalized);

    // Check for existing active identity of same type & hash
    const existing = await this.prisma.identity.findFirst({
      where: {
        type: dto.type,
        publicValueHash: hash,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException(
        `An identity of type ${dto.type} with this value already exists`,
      );
    }

    const enc = await this.encryption.encryptPublicValue(normalized);
    const masked = this.encryption.maskPublicValue(normalized, dto.type);

    const identity = await this.prisma.identity.create({
      data: {
        type: dto.type,
        publicValueHash: hash,
        publicValueCiphertext: enc.ciphertextBase64,
        publicValueIv: enc.ivBase64,
        publicValueTag: enc.tagBase64,
        publicValueWrappedKey: enc.wrappedKeyBase64,
        publicValueKeyId: enc.keyId,
        publicValueMasked: masked,
        userId,
        isVerified: false,
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
    if (!dto.publicValue) {
      return this.toMaskedResponse(identity);
    }

    const normalized = this.normalize(dto.publicValue, identity.type);
    const hash = await this.encryption.computeHash(normalized);

    const duplicate = await this.prisma.identity.findFirst({
      where: {
        type: identity.type,
        publicValueHash: hash,
        deletedAt: null,
        id: { not: id },
      },
    });
    if (duplicate) {
      throw new ConflictException(
        `Another identity of type ${identity.type} with this value already exists`,
      );
    }

    const enc = await this.encryption.encryptPublicValue(normalized);
    const masked = this.encryption.maskPublicValue(normalized, identity.type);

    const updated = await this.prisma.identity.update({
      where: { id },
      data: {
        publicValueHash: hash,
        publicValueCiphertext: enc.ciphertextBase64,
        publicValueIv: enc.ivBase64,
        publicValueTag: enc.tagBase64,
        publicValueWrappedKey: enc.wrappedKeyBase64,
        publicValueKeyId: enc.keyId,
        publicValueMasked: masked,
      },
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

  private normalize(value: string, type: IdentityType): string {
    switch (type) {
      case IdentityType.EMAIL:
        return value.trim().toLowerCase();
      case IdentityType.PHONE:
        return value.replace(/\D/g, '');
      case IdentityType.INSTAGRAM:
      case IdentityType.LINKEDIN:
        return value.replace(/^@/, '').trim().toLowerCase();
      default:
        return value.trim();
    }
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