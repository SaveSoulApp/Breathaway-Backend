import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthCredentialType, IdentityType, User } from '@prisma/client';
import { nanoid } from 'nanoid';
import { BaseService } from '@core/base/base.service';
import { LoggerService } from '@core/logger/logger.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { FirebaseService } from '@modules/firebase/firebase.service';
import {
  AddSecondaryAuthDto,
  AuthSigninDto,
  AuthSignupDto,
  DevLoginDto,
  SocialAuthDto,
} from './dto';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { AuthMethod } from './utils/auth-method.utils';

@Injectable()
export class AuthService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly firebaseAdmin: FirebaseService,
    private readonly jwtService: JwtService,
    private readonly encryptionService: IdentityCryptoService,
  ) {
    super(logger);
  }

  // ---------- Phone / Email Signup ----------
  async signup(dto: AuthSignupDto) {
    const { authMethod } = await this.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );
    this.ensurePhoneOrEmail(authMethod.method);

    const value = authMethod.identifier; // raw phone or email
    const valueHash = await this.encryptionService.computeHash(value);

    // Check global uniqueness via AuthCredential
    const existingCred = await this.prisma.authCredential.findUnique({
      where: { valueHash },
      select: {
        userId: true,
        identity: {
          select: {
            isVerified: true,
          },
        },
      },
    });

    if (existingCred) {
      if (existingCred.identity.isVerified) {
        throw new ConflictException(
          `An account with this ${authMethod.method.toLowerCase()} already exists`,
        );
      }
      // Unverified – resend OTP (handled by the controller / frontend)
      throw new ConflictException(
        'Verification pending. Please verify your account.',
      );
    }

    // Encrypt public value
    const encPublic = await this.encryptionService.encryptPublicValue(value);
    const valueMasked = this.encryptionService.maskPublicValue(
      value,
      authMethod.method === AuthMethod.PHONE
        ? IdentityType.PHONE
        : IdentityType.EMAIL,
    );

    const user = await this.prisma.$transaction(async (tx) => {
      // Create User
      const newUser = await tx.user.create({
        data: {},
      });

      // Create Identity
      const newIdentity = await tx.identity.create({
        data: {
          type: this.toCredentialType(authMethod.method),
          publicValueHash: valueHash,
          publicValueCiphertext: encPublic.ciphertextBase64,
          publicValueIv: encPublic.ivBase64,
          publicValueTag: encPublic.tagBase64,
          publicValueWrappedKey: encPublic.wrappedKeyBase64,
          publicValueKeyId: encPublic.keyId,
          publicValueMasked: valueMasked,
          userId: newUser.id,
          isVerified: false,
          verifiedAt: null,
        },
      });

      // Create AuthCredential (thin index)
      await tx.authCredential.create({
        data: {
          userId: newUser.id,
          type: this.toCredentialType(authMethod.method),
          valueHash,
          valueMasked: valueMasked,
          isPrimary: true,
          identityId: newIdentity.id,
        },
      });

      return newUser;
    });

    // TODO: Send OTP / magic link to the value
    this.logger.log(
      `Created user ${user.id} with ${authMethod.method} – OTP pending.`,
    );

    return { userId: user.id, status: 'pending_verification' };
  }

  // ---------- Phone / Email Signin ----------
  async signin(dto: AuthSigninDto) {
    const { authMethod } = await this.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );
    this.ensurePhoneOrEmail(authMethod.method);

    const value = authMethod.identifier;
    const valueHash = await this.encryptionService.computeHash(value);

    const credential = await this.prisma.authCredential.findUnique({
      where: { valueHash },
      select: {
        userId: true,
        identity: {
          select: {
            isVerified: true,
          },
        },
      },
    });

    if (!credential) {
      throw new NotFoundException('No account found with this credential');
    }

    if (!credential.identity.isVerified) {
      // Resend OTP / magic link – frontend should show verification screen
      throw new UnauthorizedException(
        'Account not verified. Verification code resent.',
      );
    }

    // At this point the user exists and is verified. Proceed to send OTP/link.
    // For simplicity, we issue a JWT directly (in real app you'd send OTP and then confirm).
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: credential.userId },
    });

    return this.generateAuthResponse(user);
  }

  // ---------- Sign‑in or Sign‑up (phone/email) ----------
  async signInOrSignUp(dto: AuthSigninDto) {
    const { authMethod } = await this.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );
    this.ensurePhoneOrEmail(authMethod.method);

    const value = authMethod.identifier;
    const valueHash = await this.encryptionService.computeHash(value);

    let credential = await this.prisma.authCredential.findUnique({
      where: { valueHash },
      select: {
        userId: true,
        identity: {
          select: {
            isVerified: true,
          },
        },
      },
    });

    if (!credential) {
      const encPublic = await this.encryptionService.encryptPublicValue(value);
      const valueMasked = this.encryptionService.maskPublicValue(
        value,
        authMethod.method === AuthMethod.PHONE
          ? IdentityType.PHONE
          : IdentityType.EMAIL,
      );

      const user = await this.prisma.$transaction(async (tx) => {
        // New user – create account
        const newUser = await tx.user.create({ data: {} });

        const newIdentity = await tx.identity.create({
          data: {
            type: this.toCredentialType(authMethod.method),
            publicValueHash: valueHash,
            publicValueCiphertext: encPublic.ciphertextBase64,
            publicValueIv: encPublic.ivBase64,
            publicValueTag: encPublic.tagBase64,
            publicValueWrappedKey: encPublic.wrappedKeyBase64,
            publicValueKeyId: encPublic.keyId,
            publicValueMasked: valueMasked,
            userId: newUser.id,
            isVerified: true,
            verifiedAt: new Date(),
          },
        });

        await tx.authCredential.create({
          data: {
            userId: newUser.id,
            type: this.toCredentialType(authMethod.method),
            valueHash,
            valueMasked: valueMasked,
            isPrimary: true,
            identityId: newIdentity.id,
          },
        });

        return newUser;
      });

      this.logger.log(`New signup via signInOrSignUp for user ${user.id}`);
      return { userId: user.id, status: 'pending_verification' };
    }

    // Existing credential
    if (!credential.identity.isVerified) {
      throw new UnauthorizedException(
        'Account not verified. Verification code resent.',
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: credential.userId },
    });
    return this.generateAuthResponse(user);
  }

  // ---------- Social Sign‑up / Sign‑in ----------
  async socialAuth(dto: SocialAuthDto) {
    const { type, platformUserId, handle } = dto; // type: 'INSTAGRAM' | 'LINKEDIN' etc.

    // platformUserId hash
    const platformIdHash =
      await this.encryptionService.computeHash(platformUserId);

    let identity = await this.prisma.identity.findFirst({
      where: { type, platformIdHash },
      select: { id: true, userId: true, isVerified: true },
    });

    if (identity) {
      if (identity.userId === null) {
        throw new ConflictException(
          'This account has been deleted. Please re‑verify to recover it.',
        );
      }
      // User exists and is verified – log them in
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: identity.userId },
      });
      return this.generateAuthResponse(user);
    }

    // Encrypt handle (public value) and platformUserId (platformId)
    const encHandle = await this.encryptionService.encryptPublicValue(handle);
    const handleMasked = this.encryptionService.maskPublicValue(
      handle,
      type as IdentityType,
    );
    const encPlatformId =
      await this.encryptionService.encryptPlatformId(platformUserId);

    const publicValueHash = await this.encryptionService.computeHash(handle);

    const user = await this.prisma.$transaction(async (tx) => {
      // New social identity
      const newUser = await tx.user.create({ data: {} });

      await tx.identity.create({
        data: {
          type,
          publicValueHash,
          publicValueCiphertext: encHandle.ciphertextBase64,
          publicValueIv: encHandle.ivBase64,
          publicValueTag: encHandle.tagBase64,
          publicValueWrappedKey: encHandle.wrappedKeyBase64,
          publicValueKeyId: encHandle.keyId,
          publicValueMasked: handleMasked,

          platformIdHash,
          platformIdCiphertext: encPlatformId.ciphertextBase64,
          platformIdIv: encPlatformId.ivBase64,
          platformIdTag: encPlatformId.tagBase64,
          platformIdWrappedKey: encPlatformId.wrappedKeyBase64,
          platformIdKeyId: encPlatformId.keyId,

          userId: newUser.id,
          isVerified: true, // social accounts are pre‑verified
          verifiedAt: new Date(),
        },
      });

      return newUser;
    });

    // No AuthCredential for social types.

    this.logger.log(`New social sign‑up (${type}) for user ${user.id}`);
    return this.generateAuthResponse(user);
  }

  // ---------- Add Secondary Phone / Email ----------
  async addSecondaryAuth(
    userId: string,
    dto: AddSecondaryAuthDto,
    authType: AuthMethod.PHONE | AuthMethod.EMAIL,
  ) {
    // 1. Validate Firebase token and get identifier
    const { authMethod } = await this.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );
    this.ensurePhoneOrEmail(authMethod.method);

    if (
      (authType === AuthMethod.PHONE &&
        authMethod.method !== AuthMethod.PHONE) ||
      (authType === AuthMethod.EMAIL && authMethod.method !== AuthMethod.EMAIL)
    ) {
      throw new ConflictException(
        `Token does not match the expected ${authType} method`,
      );
    }

    const value = authMethod.identifier;
    const valueHash = await this.encryptionService.computeHash(value);

    // 2. Check global uniqueness
    const existingCred = await this.prisma.authCredential.findUnique({
      where: { valueHash },
    });
    if (existingCred) {
      throw new ConflictException(
        `This ${authType} is already associated with an account`,
      );
    }

    // 3. Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    // 4. If user already has a primary of this type? For now we allow only one per type – enforce later.
    // 5. Encrypt and create Identity + AuthCredential
    const encPublic = await this.encryptionService.encryptPublicValue(value);
    const valueMasked = this.encryptionService.maskPublicValue(
      value,
      authType === AuthMethod.PHONE ? IdentityType.PHONE : IdentityType.EMAIL,
    );

    await this.prisma.$transaction(async (tx) => {
      const identity = await tx.identity.create({
        data: {
          type: this.toCredentialType(authType),
          publicValueHash: valueHash,
          publicValueCiphertext: encPublic.ciphertextBase64,
          publicValueIv: encPublic.ivBase64,
          publicValueTag: encPublic.tagBase64,
          publicValueWrappedKey: encPublic.wrappedKeyBase64,
          publicValueKeyId: encPublic.keyId,
          publicValueMasked: valueMasked,
          userId: user.id,
          isVerified: false, // will need verification
        },
      });

      // Determine if this should be primary (if user has no primary credential yet, set true)
      const primaryCount = await tx.authCredential.count({
        where: { userId: user.id, isPrimary: true },
      });
      const isPrimary = primaryCount === 0;

      await tx.authCredential.create({
        data: {
          userId: user.id,
          type: this.toCredentialType(authType),
          valueHash,
          valueMasked: valueMasked,
          isPrimary,
          identityId: identity.id,
        },
      });
    });

    // TODO: Send verification code to the new value
    return this.generateAuthResponse(user);
  }

  // ---------- Dev Login ----------
  async devLogin(dto: DevLoginDto) {
    const value = dto.identifier;
    const valueHash = await this.encryptionService.computeHash(value);

    const credential = await this.prisma.authCredential.findFirst({
      where: { valueHash },
      include: { user: true },
    });

    if (!credential) {
      throw new NotFoundException('User not found');
    }

    return this.generateAuthResponse(credential.user);
  }

  // ---------- Common Helpers ----------
  private async validateFirebaseToken(uid: string, uidToken: string) {
    const { authMethod, decodedToken } =
      await this.firebaseAdmin.validateFirebaseToken(uid, uidToken);
    return { authMethod, decodedToken };
  }

  private ensurePhoneOrEmail(method: AuthMethod) {
    if (method !== AuthMethod.PHONE && method !== AuthMethod.EMAIL) {
      throw new ConflictException(
        'Only phone or email authentication is allowed for this endpoint',
      );
    }
  }

  private generateAuthResponse(user: User) {
    const payload = {
      sub: user.id,
      iss: this.configService.get<string>('JWT_ISSUER'),
      aud: this.configService.get<string>('JWT_AUDIENCE'),
      jti: nanoid(24),
    };

    const accessToken = this.jwtService.sign(payload);
    return {
      access_token: accessToken,
      user_id: user.id,
    };
  }

  signout() {
    // Token revocation can be implemented later
    return { message: 'Signout successful' };
  }

  private toCredentialType(method: AuthMethod): AuthCredentialType {
    return method === AuthMethod.PHONE
      ? AuthCredentialType.PHONE
      : AuthCredentialType.EMAIL;
  }
}
