import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { Injectable } from '@nestjs/common';
import { AuthCredentialType, IdentityType, User } from '@prisma/client';
import { AuthMethod } from '../utils/auth-method.utils';

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
    valueHash: string,
    authMethod: AuthMethod,
    isVerified = false,
  ): Promise<User> {
    const encPublic = await this.encryptionService.encryptPublicValue(value);
    const valueMasked = this.encryptionService.maskPublicValue(
      value,
      authMethod === AuthMethod.PHONE ? IdentityType.PHONE : IdentityType.EMAIL,
    );

    return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({ data: {} });

      const newIdentity = await tx.identity.create({
        data: {
          type: this.toCredentialType(authMethod),
          publicValueHash: valueHash,
          publicValueCiphertext: encPublic.ciphertextBase64,
          publicValueIv: encPublic.ivBase64,
          publicValueTag: encPublic.tagBase64,
          publicValueWrappedKey: encPublic.wrappedKeyBase64,
          publicValueKeyId: encPublic.keyId,
          publicValueMasked: valueMasked,
          userId: newUser.id,
          isVerified,
          verifiedAt: isVerified ? new Date() : null,
        },
      });

      await tx.authCredential.create({
        data: {
          userId: newUser.id,
          type: this.toCredentialType(authMethod),
          valueHash,
          valueMasked: valueMasked,
          isPrimary: true,
          identityId: newIdentity.id,
        },
      });

      return newUser;
    });
  }

  toCredentialType(method: AuthMethod): AuthCredentialType {
    return method === AuthMethod.PHONE
      ? AuthCredentialType.PHONE
      : AuthCredentialType.EMAIL;
  }
}
