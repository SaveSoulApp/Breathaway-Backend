import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { nanoid } from 'nanoid';
import { BaseService } from 'src/base/services/base.service';
import { LoggerService } from 'src/core/logger/logger.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { FirebaseService } from 'src/modules/firebase/firebase.service';
import { AuthVerificationService } from './auth-verification.service';
import {
  AddSecondaryAuthDto,
  AuthSigninDto,
  AuthSignupDto,
  DevLoginDto,
} from './dto';
import { AuthMethod, AuthMethodInfo } from './utils/auth-method.utils';

@Injectable()
export class AuthService extends BaseService {
  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly firebaseAdmin: FirebaseService,
    private readonly jwtService: JwtService,
    private readonly authVerificationService: AuthVerificationService,
  ) {
    super(loggerService);
  }

  async signup(dto: AuthSignupDto) {
    const { authMethod, firebaseUser } = await this.fetchUserDetails(dto);
    this.logger.log('Auth method:', authMethod);

    const userData = this.buildUserDataFromAuthMethod(authMethod);
    const user = await this.prismaService.user.create({ data: userData });

    return this.generateAuthResponse(user);
  }

  async signin(dto: AuthSigninDto) {
    const { authMethod } = await this.firebaseAdmin.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );

    this.logger.log('Auth method on signin:', authMethod);

    const user = await this.findUserByAuthMethod(dto.uid, authMethod);

    if (!user) {
      throw this.buildUserNotFoundException(authMethod, dto.uid);
    }

    await this.updateUserVerificationStatus(user, authMethod);

    return this.generateAuthResponse(user);
  }

  async signInOrSignUp(dto: AuthSigninDto) {
    const { authMethod } = await this.firebaseAdmin.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );

    this.logger.log('Auth method on signin:', authMethod);

    let user = await this.findUserByAuthMethod(dto.uid, authMethod);

    if (!user) {
      const userData = this.buildUserDataFromAuthMethod(authMethod);
      user = await this.prismaService.user.create({ data: userData });
    } else {
      await this.updateUserVerificationStatus(user, authMethod);
    }

    return this.generateAuthResponse(user);
  }

  async addSecondaryAuth(
    currentUser: number,
    dto: AddSecondaryAuthDto,
    authType: 'phone' | 'email',
  ) {
    const { authMethod } = await this.firebaseAdmin.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );

    this.authVerificationService.validateAuthMethodType(authMethod, authType);

    const user = await this.getUserById(currentUser);

    this.authVerificationService.validateUserHasNoExistingAuthMethod(
      user,
      authType,
    );

    await this.authVerificationService.validateAuthIdentifierNotUsedByOthers(
      authMethod.identifier,
      authType,
      user.user_id,
    );

    const updatedUser = await this.updateUserWithAuthMethod(
      user.user_id,
      authMethod,
      authType,
    );

    return this.generateAuthResponse(updatedUser);
  }

  async devLogin(dto: DevLoginDto) {
    const isEmail = dto.identifier.includes('@');
    let user: User | null = null;

    if (isEmail) {
      user = await this.prismaService.user.findUnique({
        where: { email: dto.identifier },
      });
    } else {
      user = await this.prismaService.user.findUnique({
        where: { phone: dto.identifier },
      });
    }

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.generateAuthResponse(user);
  }

  private async findUserByAuthMethod(
    uid: string,
    authMethod: AuthMethodInfo,
  ): Promise<User | null> {
    const whereClause = this.buildUserWhereClause(uid, authMethod);
    return this.prismaService.user.findFirst({ where: whereClause });
  }

  private buildUserWhereClause(uid: string, authMethod: AuthMethodInfo): any {
    if (authMethod.method === AuthMethod.GOOGLE) {
      return { email: authMethod.identifier };
    } else if (authMethod.method === AuthMethod.PHONE) {
      return { phone: authMethod.identifier };
    }
    return { uid };
  }

  private buildUserDataFromAuthMethod(authMethod: AuthMethodInfo): any {
    const userData: any = {};

    if (authMethod.method === AuthMethod.GOOGLE) {
      userData.email = authMethod.identifier;
      userData.email_verified = authMethod.isVerified;
      userData.phone = null;
      userData.phone_verified = false;
    } else if (authMethod.method === AuthMethod.PHONE) {
      userData.phone = authMethod.identifier;
      userData.phone_verified = authMethod.isVerified;
      userData.email = null;
      userData.email_verified = false;
    } else {
      // For other methods, prefer email if available
      if (authMethod.identifier.includes('@')) {
        userData.email = authMethod.identifier;
        userData.email_verified = authMethod.isVerified;
        userData.phone = null;
        userData.phone_verified = false;
      } else {
        // Fallback to phone if it looks like a phone number
        userData.phone = authMethod.identifier;
        userData.phone_verified = authMethod.isVerified;
        userData.email = null;
        userData.email_verified = false;
      }
    }

    return userData;
  }

  private async updateUserVerificationStatus(
    user: User,
    authMethod: AuthMethodInfo,
  ): Promise<void> {
    if (
      authMethod.method === AuthMethod.GOOGLE &&
      user.email &&
      !user.email_verified
    ) {
      await this.prismaService.user.update({
        where: { user_id: user.user_id },
        data: { email_verified: authMethod.isVerified },
      });
    } else if (
      authMethod.method === AuthMethod.PHONE &&
      user.phone &&
      !user.phone_verified
    ) {
      await this.prismaService.user.update({
        where: { user_id: user.user_id },
        data: { phone_verified: authMethod.isVerified },
      });
    }
  }

  private buildUserNotFoundException(
    authMethod: AuthMethodInfo,
    uid: string,
  ): NotFoundException {
    if (authMethod.method === AuthMethod.GOOGLE) {
      return new NotFoundException(
        `User with email ${authMethod.identifier} not found. Please sign up first.`,
      );
    } else if (authMethod.method === AuthMethod.PHONE) {
      return new NotFoundException(
        `User with phone ${authMethod.identifier} not found. Please sign up first.`,
      );
    } else {
      return new NotFoundException(
        `User with UID ${uid} not found. Please sign up first.`,
      );
    }
  }

  private async getUserById(currentUser: number): Promise<User> {
    const user = await this.prismaService.user.findUnique({
      where: { user_id: currentUser },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async updateUserWithAuthMethod(
    userId: number,
    authMethod: AuthMethodInfo,
    authType: 'phone' | 'email',
  ): Promise<User> {
    const updateData: any = {};

    if (authType === 'phone') {
      updateData.phone = authMethod.identifier;
      updateData.phone_verified = authMethod.isVerified;
    } else {
      updateData.email = authMethod.identifier;
      updateData.email_verified = authMethod.isVerified;
    }

    return this.prismaService.user.update({
      where: { user_id: userId },
      data: updateData,
    });
  }

  private generateAuthResponse(user: User) {
    return {
      access_token: this.jwtService.sign(this.generateJwtPayload(user)),
      ...user,
    };
  }

  async signout() {
    //To be Implemented
    return { message: 'Hello World' };
  }

  private async fetchUserDetails(
    dto: AuthSignupDto,
  ): Promise<{ authMethod: AuthMethodInfo; firebaseUser: any }> {
    // Verify the Firebase ID token
    const { authMethod, decodedToken } =
      await this.firebaseAdmin.validateFirebaseToken(dto.uid, dto.uidToken);

    // Get additional user info from Firebase
    const firebaseUser = await this.firebaseAdmin.getUser(dto.uid);

    // Check if user already exists with the same identifier
    let existingUserByIdentifier: User | null = null;
    if (authMethod.method === AuthMethod.GOOGLE) {
      existingUserByIdentifier = await this.prismaService.user.findUnique({
        where: { email: authMethod.identifier },
      });
    } else if (authMethod.method === AuthMethod.PHONE) {
      existingUserByIdentifier = await this.prismaService.user.findUnique({
        where: { phone: authMethod.identifier },
      });
    }

    if (existingUserByIdentifier) {
      if (authMethod.method === AuthMethod.GOOGLE) {
        throw new ConflictException('User already exists with this email');
      } else if (authMethod.method === AuthMethod.PHONE) {
        throw new ConflictException(
          'User already exists with this phone number',
        );
      }
    }

    return { authMethod, firebaseUser };
  }

  private generateJwtPayload(user: User) {
    const payload: any = {
      sub: user.user_id,
      iss: this.configService.get('APP_NAME'),
      aud: this.configService.get('JWT_AUDIENCE'),
      jti: nanoid(24),
    };

    return payload;
  }
}
