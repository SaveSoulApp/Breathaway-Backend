import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { IdentityEncryptionService } from './identity-encryption.service';

@Injectable()
export class AuthVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: IdentityEncryptionService,
  ) {}

  async assertIdentifierUnique(value: string) {
    const hash = await this.encryptionService.computeHash(value);
    const existing = await this.prisma.authCredential.findUnique({
      where: { valueHash: hash },
    });
    if (existing) {
      throw new ConflictException('This identifier is already in use');
    }
  }

  async assertUserDoesNotHaveAuthType(userId: string, type: 'PHONE' | 'EMAIL') {
    const count = await this.prisma.authCredential.count({
      where: { userId, type },
    });
    if (count > 0) {
      throw new ConflictException(
        `User already has a ${type.toLowerCase()} credential`,
      );
    }
  }

  async assertSocialIdentityNotUsed(
    type: 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'OTHER',
    platformUserId: string,
  ) {
    const hash = await this.encryptionService.computeHash(platformUserId);
    const existing = await this.prisma.identity.findFirst({
      where: { type, platformIdHash: hash },
    });
    if (existing && existing.userId) {
      throw new ConflictException('This social account is already linked');
    }
  }
}
