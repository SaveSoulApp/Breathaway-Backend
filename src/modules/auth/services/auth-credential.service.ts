import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { ConflictException, Injectable } from '@nestjs/common';
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
    private readonly pubSubPublisher: PubSubPublisherService,
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

      const existingIdentity = await tx.identity.findUnique({
        where: {
          type_publicValueHash: {
            type: identityType,
            publicValueHash: publicValueData.publicValueHash,
          },
        },
      });

      let identityId: string;

      if (existingIdentity) {
        if (existingIdentity.userId !== null) {
          // Ghost identity already claimed by a different user — real conflict.
          throw new ConflictException(
            `An account for this ${identityType.toLowerCase()} already exists`,
          );
        }

        // "Ghost" identity created by the likes flow (userId=null). Claim it by
        // attaching the new user. We also refresh all encrypted fields so the
        // new user's key rotation applies going forward.
        const updatedIdentity = await tx.identity.update({
          where: { id: existingIdentity.id },
          data: {
            ...publicValueData,
            userId: newUser.id,
            isVerified,
            verifiedAt: isVerified ? DateUtil.now() : null,
          },
        });
        identityId = updatedIdentity.id;

        this.logger.log(
          `Claimed ghost identity ${identityId} for new user ${newUser.id}`,
        );

        // A ghost identity was claimed — publish the event so the
        // identity-workflows handler can backfill targetUserId on any
        // existing likes and trigger mutual-like / match resolution.
        // This is fire-and-forget; Pub/Sub provides durability guarantees.
        this.pubSubPublisher
          .publish(
            PubSubTopic.IDENTITY_WORKFLOWS,
            PubSubEvent.IDENTITY_CLAIMED,
            {
              userId: newUser.id,
            },
          )
          .catch((err: Error) => {
            this.logger.error(
              `Failed to publish ${PubSubEvent.IDENTITY_CLAIMED} event for new user ${newUser.id}`,
              { error: err.message },
            );
          });
      } else {
        const newIdentity = await tx.identity.create({
          data: {
            type: identityType,
            ...publicValueData,
            userId: newUser.id,
            isVerified,
            verifiedAt: isVerified ? DateUtil.now() : null,
          },
        });
        identityId = newIdentity.id;
      }

      await tx.authCredential.create({
        data: {
          userId: newUser.id,
          type: this.toCredentialType(authMethod),
          valueHash: publicValueData.publicValueHash,
          valueMasked: publicValueData.publicValueMasked,
          isPrimary: true,
          identityId: identityId,
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
