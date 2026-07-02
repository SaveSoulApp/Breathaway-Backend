import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { Injectable } from '@nestjs/common';
import { Prisma, UserProfile } from '@prisma/client';
import {
  ProfileAlreadyExistsException,
  ProfileNotFoundException,
} from './application/exceptions';
import {
  CreateProfileRequestDto,
  PatchProfileRequestDto,
  UpdateProfileRequestDto,
} from './dto';

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
   *
   * @param userId - ULID of the authenticated user who owns this profile.
   * @param createProfileDto - Display name, date of birth, and any other
   *                           initial profile fields.
   * @returns The newly persisted `UserProfile` record.
   * @throws {ConflictException} When a profile already exists for the given user.
   */
  async createProfile(
    userId: string,
    createProfileDto: CreateProfileRequestDto,
  ): Promise<UserProfile> {
    this.logger.debug(`Creating profile for user: ${userId}`);

    // Check if profile already exists
    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      throw new ProfileAlreadyExistsException(userId);
    }

    try {
      const profile = await this.prisma.userProfile.create({
        data: {
          userId,
          ...createProfileDto,
          dateOfBirth: createProfileDto.dateOfBirth
            ? DateUtil.parse(createProfileDto.dateOfBirth)
            : null,
        },
      });

      this.emitAuditLog({
        actionType: AuditActionType.PROFILE_CREATED,
        userId: userId,
      });

      this.logger.log(`Profile created successfully for user: ${userId}`);
      return profile;
    } catch (error) {
      const err = error as { stack?: string };
      this.logger.error(`Failed to create profile for user ${userId}`, {
        stack: err.stack,
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
    this.logger.debug(`Fetching profile for user: ${userId}`);

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new ProfileNotFoundException(userId);
    }

    return profile;
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
    this.logger.debug(`Fetching profile with ID: ${id}`);

    const profile = await this.prisma.userProfile.findUnique({
      where: { id },
    });

    if (!profile) {
      throw new ProfileNotFoundException(id);
    }

    return profile;
  }

  /**
   * Fully replaces the authenticated user's profile fields (PUT semantics).
   *
   * All fields from `updateProfileDto` overwrite existing values — omitting
   * an optional field sets it to its default, not its current value.
   * An ISO 8601 `dateOfBirth` string is converted to a `Date` before the
   * update; omitting it explicitly sets the column to `null`.
   * Emits a `PROFILE_UPDATED` audit event on success.
   *
   * @param userId - ULID of the authenticated user whose profile to replace.
   * @param updateProfileDto - Complete new field values for the profile.
   * @returns The updated `UserProfile` record.
   * @throws {NotFoundException} When no profile exists for the given user.
   */
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileRequestDto,
  ): Promise<UserProfile> {
    this.logger.debug(`Updating profile for user: ${userId}`);

    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      throw new ProfileNotFoundException(userId);
    }

    try {
      const updatedProfile = await this.prisma.userProfile.update({
        where: { userId },
        data: {
          ...updateProfileDto,
          dateOfBirth: updateProfileDto.dateOfBirth
            ? DateUtil.parse(updateProfileDto.dateOfBirth)
            : null,
        },
      });

      this.emitAuditLog({
        actionType: AuditActionType.PROFILE_UPDATED,
        userId: userId,
      });

      this.logger.log(`Profile updated successfully for user: ${userId}`);
      return updatedProfile;
    } catch (error) {
      const err = error as { stack?: string };
      this.logger.error(`Failed to update profile for user ${userId}`, {
        stack: err.stack,
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
   * @returns The patched `UserProfile` record.
   * @throws {NotFoundException} When no profile exists for the given user.
   */
  async patchProfile(
    userId: string,
    patchProfileDto: PatchProfileRequestDto,
  ): Promise<UserProfile> {
    this.logger.debug(`Patching profile for user: ${userId}`);

    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      throw new ProfileNotFoundException(userId);
    }

    // Handle special case for dateOfBirth transformation
    const data: Prisma.UserProfileUpdateInput = { ...patchProfileDto };
    if (patchProfileDto.dateOfBirth) {
      data.dateOfBirth = DateUtil.parse(patchProfileDto.dateOfBirth);
    }

    try {
      const patchedProfile = await this.prisma.userProfile.update({
        where: { userId },
        data,
      });

      this.emitAuditLog({
        actionType: AuditActionType.PROFILE_UPDATED,
        userId: userId,
      });

      this.logger.log(`Profile patched successfully for user: ${userId}`);
      return patchedProfile;
    } catch (error) {
      const err = error as { stack?: string };
      this.logger.error(`Failed to patch profile for user ${userId}`, {
        stack: err.stack,
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
    this.logger.debug(`Soft-deleting account for user: ${userId}`);

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser || existingUser.deletedAt) {
      throw new ProfileNotFoundException(userId);
    }

    try {
      const now = new Date();

      await this.prisma.$transaction(async (tx) => {
        // Soft delete the user
        await tx.user.update({
          where: { id: userId },
          data: { deletedAt: now },
        });

        // Soft delete identities
        await tx.identity.updateMany({
          where: { userId, deletedAt: null },
          data: { deletedAt: now },
        });

        // Soft delete auth credentials
        await tx.authCredential.updateMany({
          where: { userId, deletedAt: null },
          data: { deletedAt: now },
        });

        // Deactivate all devices
        await tx.device.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        });
      });

      this.emitAuditLog({
        actionType: AuditActionType.ACCOUNT_DELETED,
        userId: userId,
      });

      this.logger.log(`Account soft-deleted successfully for user: ${userId}`);
    } catch (error) {
      const err = error as { stack?: string };
      this.logger.error(`Failed to soft-delete account for user ${userId}`, {
        stack: err.stack,
      });
      throw error;
    }
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
