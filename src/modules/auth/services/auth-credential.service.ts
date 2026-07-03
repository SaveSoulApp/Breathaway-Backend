import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { Injectable } from '@nestjs/common';
import { AccountAlreadyExistsException } from '../application/exceptions';

import { AuthCredentialType, IdentityType, User } from '@prisma/client';
import { AuthMethod } from '../utils/auth-method.utils';

export interface CreateUserResult {
  user: User;
  /** The normalized, canonical publicValueHash used for AuthCredential lookup */
  normalizedHash: string;
}

/**
 * Orchestrates user account provisioning, credential creation, and identity claims.
 *
 * Coordinates database updates inside a unified transaction, resolving conflicts
 * between registered users and "ghost" identities that exist due to prior activity.
 */
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

  /**
   * Provisions a new user account alongside its primary authentication credential and identity link.
   *
   * Executes database mutations within a transaction block. If an existing registered user already owns
   * the provided identity, a ConflictException is thrown. If the identity exists as a "ghost" record
   * (created during interactions like likes before registration), it claims the identity by assigning
   * it to the new user and fires an asynchronous IDENTITY_CLAIMED Pub/Sub event for background processing.
   *
   * @param value - Raw credential string (e.g. email address or phone number).
   * @param authMethod - Method used to register/authenticate the user (PHONE or EMAIL).
   * @param isVerified - Sets verification status flags and timestamps (defaults to false).
   * @returns A promise that resolves to the newly created User entity and the processed identity hash.
   * @throws {ConflictException} When the identity is already claimed by a fully registered user.
   */
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
          this.logger.warn('Identity creation failed: already claimed by another user', { existingUserId: existingIdentity.userId, identityId: existingIdentity.id });
          throw new AccountAlreadyExistsException();
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

        this.logger.log('Claimed ghost identity for new user', { identityId, userId: newUser.id });

        // A ghost identity was claimed — publish the event so the
        // identity-workflows handler can attempt match resolution for any
        // pending likes that targeted this identity.
        // Fire-and-forget; Pub/Sub provides delivery durability.
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

  /**
   * Maps an AuthMethod utility enum to the corresponding Prisma AuthCredentialType enum.
   *
   * @param method - The application auth method to map.
   * @returns The corresponding DB-level AuthCredentialType.
   */
  toCredentialType(method: AuthMethod): AuthCredentialType {
    return method === AuthMethod.PHONE
      ? AuthCredentialType.PHONE
      : AuthCredentialType.EMAIL;
  }
}
