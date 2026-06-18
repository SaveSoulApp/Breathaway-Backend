import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { Injectable } from '@nestjs/common';
import { AuthCredentialType, IdentityType, User } from '@prisma/client';
import { AuthMethod } from '../utils/auth-method.utils';

export interface CreateUserResult {
  user: User;
  /** The normalized, canonical publicValueHash used for AuthCredential lookup */
  normalizedHash: string;
}

@Injectable()
export class AuthCredentialService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly encryptionService: IdentityCryptoService,
  ) {
    super(logger);
  }

  async createUserWithCredential(
    value: string,
    authMethod: AuthMethod,
    isVerified = false,
  ): Promise<CreateUserResult> {
    const identityType =
      authMethod === AuthMethod.PHONE ? IdentityType.PHONE : IdentityType.EMAIL;

    // processPublicValue normalizes the value (strips non-digits for PHONE,
    // lowercases for EMAIL) before hashing and encrypting. This is the
    // canonical hash that the likes flow also produces, ensuring deduplication
    // works correctly via the @@unique([type, publicValueHash]) constraint.
    const publicValueData = await this.encryptionService.processPublicValue(
      value,
      identityType,
    );

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          notificationPreference: {
            create: {},
          },
        },
      });

      const newIdentity = await tx.identity.create({
        data: {
          type: identityType,
          ...publicValueData,
          userId: newUser.id,
          isVerified,
          verifiedAt: isVerified ? DateUtil.now() : null,
        },
      });

      await tx.authCredential.create({
        data: {
          userId: newUser.id,
          type: this.toCredentialType(authMethod),
          valueHash: publicValueData.publicValueHash,
          valueMasked: publicValueData.publicValueMasked,
          isPrimary: true,
          identityId: newIdentity.id,
        },
      });

      return newUser;
    });

    return { user, normalizedHash: publicValueData.publicValueHash };
  }

  toCredentialType(method: AuthMethod): AuthCredentialType {
    return method === AuthMethod.PHONE
      ? AuthCredentialType.PHONE
      : AuthCredentialType.EMAIL;
  }
}
