import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserProfile } from '@prisma/client';

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

import { CreateProfileDto, PatchProfileDto, UpdateProfileDto } from './dto';

@Injectable()
export class ProfileService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Create a new user profile
   */
  async createProfile(
    userId: string,
    createProfileDto: CreateProfileDto,
  ): Promise<UserProfile> {
    this.logger.log(`Creating profile for user: ${userId}`);

    // Check if profile already exists
    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      throw new ConflictException(`Profile already exists for user: ${userId}`);
    }

    try {
      const profile = await this.prisma.userProfile.create({
        data: {
          userId,
          ...createProfileDto,
          dateOfBirth: createProfileDto.dateOfBirth
            ? new Date(createProfileDto.dateOfBirth)
            : null,
        },
      });

      this.logger.log(`Profile created successfully for user: ${userId}`);
      return profile;
    } catch (error) {
      this.logger.error(
        `Failed to create profile for user ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get profile by user ID
   */
  async getProfileByUserId(userId: string): Promise<UserProfile> {
    this.logger.log(`Fetching profile for user: ${userId}`);

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException(`Profile not found for user: ${userId}`);
    }

    return profile;
  }

  /**
   * Get profile by profile ID
   */
  async getProfileById(id: string): Promise<UserProfile> {
    this.logger.log(`Fetching profile with ID: ${id}`);

    const profile = await this.prisma.userProfile.findUnique({
      where: { id },
    });

    if (!profile) {
      throw new NotFoundException(`Profile not found with ID: ${id}`);
    }

    return profile;
  }

  /**
   * Update profile (PUT - full replacement)
   */
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<UserProfile> {
    this.logger.log(`Updating profile for user: ${userId}`);

    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      throw new NotFoundException(`Profile not found for user: ${userId}`);
    }

    try {
      const updatedProfile = await this.prisma.userProfile.update({
        where: { userId },
        data: {
          ...updateProfileDto,
          dateOfBirth: updateProfileDto.dateOfBirth
            ? new Date(updateProfileDto.dateOfBirth)
            : null,
        },
      });

      this.logger.log(`Profile updated successfully for user: ${userId}`);
      return updatedProfile;
    } catch (error) {
      this.logger.error(
        `Failed to update profile for user ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Patch profile (PATCH - partial update)
   */
  async patchProfile(
    userId: string,
    patchProfileDto: PatchProfileDto,
  ): Promise<UserProfile> {
    this.logger.log(`Patching profile for user: ${userId}`);

    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      throw new NotFoundException(`Profile not found for user: ${userId}`);
    }

    // Handle special case for dateOfBirth transformation
    const data: Prisma.UserProfileUpdateInput = { ...patchProfileDto };
    if (patchProfileDto.dateOfBirth) {
      data.dateOfBirth = new Date(patchProfileDto.dateOfBirth);
    }

    try {
      const patchedProfile = await this.prisma.userProfile.update({
        where: { userId },
        data,
      });

      this.logger.log(`Profile patched successfully for user: ${userId}`);
      return patchedProfile;
    } catch (error) {
      this.logger.error(
        `Failed to patch profile for user ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete profile
   */
  async deleteProfile(userId: string): Promise<void> {
    this.logger.log(`Deleting profile for user: ${userId}`);

    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      throw new NotFoundException(`Profile not found for user: ${userId}`);
    }

    try {
      await this.prisma.userProfile.delete({
        where: { userId },
      });

      this.logger.log(`Profile deleted successfully for user: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete profile for user ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Check if profile exists
   */
  async profileExists(userId: string): Promise<boolean> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });
    return !!profile;
  }
}
