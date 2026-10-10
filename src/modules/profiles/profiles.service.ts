import { Injectable } from '@nestjs/common';
import { Prisma, UserProfile } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';

import {
  ProfileAlreadyExistsException,
  ProfileNotFoundException,
} from './application/exceptions';
import {
  CreateProfileRequestDto,
  PatchProfileRequestDto,
  UpdateProfileRequestDto,
} from './dto';
import { USER_DELETED_EVENT, UserDeletedEvent } from './events';

/**
 * Owns the business logic for user profile lifecycle — creation, retrieval,
 * mutation, and account-level soft deletion.
 *
 * Write operations emit an audit log event via the inherited `emitAuditLog`
 * helper. The `deleteProfile` method goes beyond the profile record itself,
 * cascading a soft delete across identities, auth credentials, and devices
 * within a single Prisma transaction.
 */
@Injectable()
export class ProfilesService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly identityCryptoService: IdentityCryptoService,
  ) {
    super(logger);
  }

  /**
   * Creates a new profile for the authenticated user and records the event in
   * the audit log.
   *
   * Enforces a one-profile-per-user constraint by querying before inserting.
   * An ISO 8601 `dateOfBirth` string, if provided, is parsed to a `Date`
   * object before persistence — raw string storage is intentionally avoided.
   * Encrypts sensitive PII (firstName, lastName) using AES-256-GCM envelope encryption.
   *
   * @param userId - ULID of the authenticated user who owns this profile.
   * @param createProfileDto - Display name, date of birth, and any other
   *                           initial profile fields.
   * @returns The newly persisted `UserProfile` record with decrypted fields.
   * @throws {ConflictException} When a profile already exists for the given user.
   */
  async createProfile(
    userId: string,
    createProfileDto: CreateProfileRequestDto,
  ): Promise<UserProfile> {
    const ctx = { userId };
    this.logger.log('Profile creation started', { ...ctx, step: 'init' });

    // Check if profile already exists
    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      this.logger.warn('Profile creation failed: already exists', {
        ...ctx,
        step: 'duplicate_check',
      });
      throw new ProfileAlreadyExistsException(userId);
    }
    this.logger.debug('Duplicate check passed', {
      ...ctx,
      step: 'duplicate_check',
    });

    try {
      const [encryptedFirstName, encryptedLastName] = await Promise.all([
        this.identityCryptoService.encryptText(
          createProfileDto.firstName.trim(),
        ),
        createProfileDto.lastName?.trim()
          ? this.identityCryptoService.encryptText(
              createProfileDto.lastName.trim(),
            )
          : Promise.resolve(null),
      ]);

      const profile = await this.prisma.userProfile.create({
        data: {
          userId,
          ...createProfileDto,
          firstName: encryptedFirstName,
          lastName: encryptedLastName,
          dateOfBirth: createProfileDto.dateOfBirth
            ? DateUtil.parse(createProfileDto.dateOfBirth)
            : null,
        },
      });

      this.logger.debug('Profile record persisted', {
        ...ctx,
        step: 'persist_profile',
        profileId: profile.id,
      });

      this.emitAuditLog({
        actionType: AuditActionType.PROFILE_CREATED,
        userId: userId,
      });

      this.logger.event(LOG_EVENT.PROFILE_CREATED, {
        ...ctx,
        profileId: profile.id,
      });
      return this.decryptProfile(profile);
    } catch (error) {
      this.logger.error('Failed to create profile', {
        ...ctx,
        step: 'persist_profile',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Retrieves the profile belonging to the authenticated user.
   *
   * Looks up by `userId` (the unique FK on the profile record), not by
   * the profile's own primary key — use `getProfileById` when the profile
   * ULID is known instead.
   *
   * @param userId - ULID of the user whose profile to fetch.
   * @returns The `UserProfile` record associated with the user.
   * @throws {NotFoundException} When no profile exists for the given user.
   */
  async getProfileByUserId(userId: string): Promise<UserProfile> {
    const ctx = { userId };
    this.logger.debug('Fetching profile by user ID', { ...ctx, step: 'fetch' });

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      this.logger.warn('Profile not found', { ...ctx, step: 'fetch' });
      throw new ProfileNotFoundException(userId);
    }

    const decryptedProfile = await this.decryptProfile(profile);

    this.logger.debug('Profile fetched successfully', {
      ...ctx,
      step: 'complete',
      profileId: profile.id,
    });
    return decryptedProfile;
  }

  /**
   * Retrieves a profile by its own primary key (ULID).
   *
   * Intended for public-facing lookups where the caller knows the profile ID
   * but not necessarily the owning user's ID (e.g., viewing another user's
   * public profile).
   *
   * @param id - ULID of the profile record to fetch.
   * @returns The matching `UserProfile` record.
   * @throws {NotFoundException} When no profile exists with the given ID.
   */
  async getProfileById(id: string): Promise<UserProfile> {
    const ctx = { profileId: id };
    this.logger.debug('Fetching profile by ID', { ...ctx, step: 'fetch' });

    const profile = await this.prisma.userProfile.findUnique({
      where: { id },
    });

    if (!profile) {
      this.logger.warn('Profile not found by ID', { ...ctx, step: 'fetch' });
      throw new ProfileNotFoundException(id);
    }

    const decryptedProfile = await this.decryptProfile(profile);

    this.logger.debug('Profile fetched successfully', {
      ...ctx,
      step: 'complete',
      userId: profile.userId,
    });
    return decryptedProfile;
  }

  /**
   * Fully replaces the authenticated user's profile fields (PUT semantics).
   *
   * All fields from `updateProfileDto` overwrite existing values — omitting
   * an optional field sets it to its default, not its current value.
   * An ISO 8601 `dateOfBirth` string is converted to a `Date` before the
   * update; omitting it explicitly sets the column to `null`.
   * Encrypts firstName and lastName using AES-256-GCM envelope encryption.
   * Emits a `PROFILE_UPDATED` audit event on success.
   *
   * @param userId - ULID of the authenticated user whose profile to replace.
   * @param updateProfileDto - Complete new field values for the profile.
   * @returns The updated `UserProfile` record with decrypted fields.
   * @throws {NotFoundException} When no profile exists for the given user.
   */
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileRequestDto,
  ): Promise<UserProfile> {
    const ctx = { userId };
    this.logger.log('Profile update started', { ...ctx, step: 'init' });

    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      this.logger.warn('Profile not found for update', {
        ...ctx,
        step: 'existence_check',
      });
      throw new ProfileNotFoundException(userId);
    }
    this.logger.debug('Profile existence verified', {
      ...ctx,
      step: 'existence_check',
    });

    try {
      const data: Prisma.UserProfileUpdateInput = {
        ...updateProfileDto,
        dateOfBirth: updateProfileDto.dateOfBirth
          ? DateUtil.parse(updateProfileDto.dateOfBirth)
          : null,
      };

      if (updateProfileDto.firstName !== undefined) {
        data.firstName = await this.identityCryptoService.encryptText(
          updateProfileDto.firstName.trim(),
        );
      }

      if (updateProfileDto.lastName !== undefined) {
        data.lastName = updateProfileDto.lastName?.trim()
          ? await this.identityCryptoService.encryptText(
              updateProfileDto.lastName.trim(),
            )
          : null;
      }

      const updatedProfile = await this.prisma.userProfile.update({
        where: { userId },
        data,
      });

      this.logger.debug('Profile record updated', {
        ...ctx,
        step: 'persist_profile',
        profileId: updatedProfile.id,
      });

      this.emitAuditLog({
        actionType: AuditActionType.PROFILE_UPDATED,
        userId: userId,
      });

      this.logger.log('Profile updated successfully', {
        ...ctx,
        step: 'complete',
        profileId: updatedProfile.id,
      });
      return this.decryptProfile(updatedProfile);
    } catch (error) {
      this.logger.error('Failed to update profile', {
        ...ctx,
        step: 'persist_profile',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Partially updates the authenticated user's profile fields (PATCH semantics).
   *
   * Only fields present in `patchProfileDto` are written; absent fields
   * retain their current values. `dateOfBirth`, when provided, is parsed
   * from ISO 8601 to `Date` before persistence — omitting it leaves the
   * existing value unchanged. Emits a `PROFILE_UPDATED` audit event on success.
   *
   * @param userId - ULID of the authenticated user whose profile to patch.
   * @param patchProfileDto - Subset of profile fields to overwrite.
   * @returns The patched `UserProfile` record with decrypted fields.
   * @throws {NotFoundException} When no profile exists for the given user.
   */
  async patchProfile(
    userId: string,
    patchProfileDto: PatchProfileRequestDto,
  ): Promise<UserProfile> {
    const ctx = { userId };
    this.logger.log('Profile patch started', { ...ctx, step: 'init' });

    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      this.logger.warn('Profile not found for patch', {
        ...ctx,
        step: 'existence_check',
      });
      throw new ProfileNotFoundException(userId);
    }
    this.logger.debug('Profile existence verified', {
      ...ctx,
      step: 'existence_check',
    });

    // Handle special case for dateOfBirth transformation
    const data: Prisma.UserProfileUpdateInput = { ...patchProfileDto };
    if (patchProfileDto.dateOfBirth) {
      data.dateOfBirth = DateUtil.parse(patchProfileDto.dateOfBirth);
    }
    if (patchProfileDto.firstName !== undefined) {
      data.firstName = await this.identityCryptoService.encryptText(
        patchProfileDto.firstName.trim(),
      );
    }
    if (patchProfileDto.lastName !== undefined) {
      data.lastName = patchProfileDto.lastName?.trim()
        ? await this.identityCryptoService.encryptText(
            patchProfileDto.lastName.trim(),
          )
        : null;
    }

    try {
      const patchedProfile = await this.prisma.userProfile.update({
        where: { userId },
        data,
      });

      this.logger.debug('Profile record patched', {
        ...ctx,
        step: 'persist_profile',
        profileId: patchedProfile.id,
      });

      this.emitAuditLog({
        actionType: AuditActionType.PROFILE_UPDATED,
        userId: userId,
      });

      this.logger.log('Profile patched successfully', {
        ...ctx,
        step: 'complete',
        profileId: patchedProfile.id,
      });
      return this.decryptProfile(patchedProfile);
    } catch (error) {
      this.logger.error('Failed to patch profile', {
        ...ctx,
        step: 'persist_profile',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Soft-deletes the user's account and all directly owned data in a single
   * atomic transaction.
   *
   * Sets `deletedAt` on the `User` record and any active `Identity` /
   * `AuthCredential` rows, and flips `isActive` to `false` on all linked
   * `Device` records. The profile row itself is not deleted — it remains
   * associated with the (now-deleted) user for audit and recovery purposes.
   * Emits an `ACCOUNT_DELETED` audit event after the transaction commits.
   *
   * @param userId - ULID of the authenticated user to soft-delete.
   * @throws {NotFoundException} When no active user exists with the given ID
   *   (either not found or already soft-deleted).
   */
  async deleteProfile(userId: string): Promise<void> {
    const ctx = { userId };
    this.logger.log('Account soft-deletion started', { ...ctx, step: 'init' });

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser || existingUser.deletedAt) {
      this.logger.warn('User not found or already deleted', {
        ...ctx,
        step: 'user_check',
      });
      throw new ProfileNotFoundException(userId);
    }
    this.logger.debug('User status verified', { ...ctx, step: 'user_check' });

    try {
      const now = new Date();

      await this.prisma.$transaction(async (tx) => {
        // Soft delete the user
        await tx.user.update({
          where: { id: userId },
          data: { deletedAt: now },
        });
        this.logger.debug('User record soft-deleted', {
          ...ctx,
          step: 'soft_delete_user',
        });

        // Soft delete identities
        await tx.identity.updateMany({
          where: { userId, deletedAt: null },
          data: { deletedAt: now },
        });
        this.logger.debug('User identities soft-deleted', {
          ...ctx,
          step: 'soft_delete_identities',
        });

        // Soft delete auth credentials
        await tx.authCredential.updateMany({
          where: { userId, deletedAt: null },
          data: { deletedAt: now },
        });
        this.logger.debug('User auth credentials soft-deleted', {
          ...ctx,
          step: 'soft_delete_credentials',
        });

        // Deactivate all devices
        await tx.device.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        });
        this.logger.debug('User devices deactivated', {
          ...ctx,
          step: 'deactivate_devices',
        });
      });

      this.emitAuditLog({
        actionType: AuditActionType.ACCOUNT_DELETED,
        userId: userId,
      });

      this.eventEmitter.emit(USER_DELETED_EVENT, new UserDeletedEvent(userId));

      this.logger.event(LOG_EVENT.ACCOUNT_DELETED, {
        ...ctx,
      });
    } catch (error) {
      this.logger.error('Account soft-deletion transaction failed', {
        ...ctx,
        step: 'persist_transaction',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Decrypts encrypted PII fields (firstName, lastName) on a UserProfile record.
   * If a field was not encrypted (e.g. legacy/mock data), falls back gracefully.
   *
   * @param profile - The raw UserProfile database record.
   * @returns The UserProfile record with decrypted plaintext fields.
   */
  private async decryptProfile(profile: UserProfile): Promise<UserProfile> {
    const [decryptedFirstName, decryptedLastName] = await Promise.all([
      this.identityCryptoService.decryptText(profile.firstName),
      profile.lastName
        ? this.identityCryptoService.decryptText(profile.lastName)
        : Promise.resolve(null),
    ]);

    return {
      ...profile,
      firstName: decryptedFirstName ?? profile.firstName,
      lastName: decryptedLastName ?? profile.lastName,
    };
  }

  /**
   * Checks whether a profile exists for the given user without fetching the
   * full record.
   *
   * Uses a `select: { userId: true }` projection to avoid transferring
   * unnecessary columns — suitable for lightweight existence guards in other
   * services or guards.
   *
   * @param userId - ULID of the user to check.
   * @returns `true` if a profile record exists; `false` otherwise.
   */
  async profileExists(userId: string): Promise<boolean> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });
    return !!profile;
  }
}
