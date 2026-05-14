import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityType, LikeStatus } from '@prisma/client';
import { BaseService } from 'src/base/services/base.service';
import { LoggerService } from 'src/core/logger/logger.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { IdentityEncryptionService } from '../identity/identity-encryption.service';
import { CreateLikeRequestDto } from './dto/request/create-like.request.dto';

@Injectable()
export class LikeService extends BaseService {
  private readonly expiryDays: number;

  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly encryption: IdentityEncryptionService,
  ) {
    super(logger);
    this.expiryDays = this.configService.get<number>('LIKE_EXPIRY_DAYS', 90);
  }

  async create(userId: string, dto: CreateLikeRequestDto) {
    let targetIdentityId = dto.targetIdentityId;

    if (!targetIdentityId && dto.targetIdentity) {
      const { type, publicValue, platformId } = dto.targetIdentity;
      const normalized = this.normalize(publicValue, type);
      const publicValueHash = await this.encryption.computeHash(normalized);

      // Check if identity exists
      const existing = await this.prisma.identity.findUnique({
        where: {
          type_publicValueHash: {
            type,
            publicValueHash,
          },
        },
      });

      if (existing) {
        targetIdentityId = existing.id;
      } else {
        // Create new unresolved identity
        const encryptedValue = await this.encryption.encryptPublicValue(normalized);
        const masked = this.encryption.maskPublicValue(normalized, type);

        // Handle platform ID if provided
        let platformIdData = {};
        if (platformId) {
          const platformHash = await this.encryption.computeHash(platformId);
          const encryptedPlatform = await this.encryption.encryptPlatformId(platformId);
          platformIdData = {
            platformIdHash: platformHash,
            platformIdCiphertext: encryptedPlatform.ciphertextBase64,
            platformIdIv: encryptedPlatform.ivBase64,
            platformIdTag: encryptedPlatform.tagBase64,
            platformIdWrappedKey: encryptedPlatform.wrappedKeyBase64,
            platformIdKeyId: encryptedPlatform.keyId,
          };
        }

        const newIdentity = await this.prisma.identity.create({
          data: {
            type,
            publicValueHash,
            publicValueCiphertext: encryptedValue.ciphertextBase64,
            publicValueIv: encryptedValue.ivBase64,
            publicValueTag: encryptedValue.tagBase64,
            publicValueWrappedKey: encryptedValue.wrappedKeyBase64,
            publicValueKeyId: encryptedValue.keyId,
            publicValueMasked: masked,
            isVerified: false,
            userId: null,
            ...platformIdData,
          },
        });
        targetIdentityId = newIdentity.id;
      }
    }

    if (!targetIdentityId) {
      throw new BadRequestException('Either targetIdentityId or targetIdentity must be provided');
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

    const expiresAt = new Date();
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

    return like;
  }

  async findAllForUser(userId: string) {
    const likes = await this.prisma.like.findMany({
      where: {
        senderUserId: userId,
        status: LikeStatus.PENDING,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
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
    return { data: likes };
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
        deletedAt: new Date(),
        status: LikeStatus.DELETED,
      },
    });

    return { success: true };
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
}
