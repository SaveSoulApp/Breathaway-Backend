import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { AuthMethod, AuthMethodInfo } from './utils/auth-method.utils';

@Injectable()
export class AuthVerificationService {
  constructor(private readonly prismaService: PrismaService) {}

  validateAuthMethodType(
    authMethod: AuthMethodInfo,
    expectedType: 'phone' | 'email',
  ) {
    if (expectedType === 'phone' && authMethod.method !== AuthMethod.PHONE) {
      throw new BadRequestException('Expected phone authentication method');
    }

    if (expectedType === 'email' && authMethod.method !== AuthMethod.GOOGLE) {
      throw new BadRequestException('Expected Google authentication method');
    }
  }

  validateUserHasNoExistingAuthMethod(user: User, authType: 'phone' | 'email') {
    if (authType === 'phone' && user.phone) {
      throw new ConflictException('Phone number already exists for this user');
    }

    if (authType === 'email' && user.email) {
      throw new ConflictException('Email already exists for this user');
    }
  }

  async validateAuthIdentifierNotUsedByOthers(
    identifier: string,
    authType: 'phone' | 'email',
    currentUserId: number,
  ) {
    let existingUser: User | null = null;

    if (authType === 'phone') {
      existingUser = await this.prismaService.user.findUnique({
        where: { phone: identifier },
      });
    } else {
      existingUser = await this.prismaService.user.findUnique({
        where: { email: identifier },
      });
    }

    if (existingUser && existingUser.user_id !== currentUserId) {
      throw new ConflictException(
        authType === 'phone'
          ? 'Phone number already used by another user'
          : 'Email already used by another user',
      );
    }
  }
}
