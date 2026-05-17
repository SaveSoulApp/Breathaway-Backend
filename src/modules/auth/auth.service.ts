import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { FirebaseService } from '@modules/firebase/firebase.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentityType } from '@prisma/client';
import {
  AddSecondaryAuthDto,
  AuthSigninDto,
  AuthSignupDto,
  DevLoginDto,
  SocialAuthDto,
} from './dto';
import { AuthCredentialService } from './services/auth-credential.service';
import { AuthTokenService } from './services/auth-token.service';
import { AuthMethod } from './utils/auth-method.utils';

@Injectable()
export class AuthService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly firebaseAdmin: FirebaseService,
    private readonly encryptionService: IdentityCryptoService,
    private readonly authCredentialService: AuthCredentialService,
    private readonly authTokenService: AuthTokenService,
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

    const user = await this.authCredentialService.createUserWithCredential(
      value,
      valueHash,
      authMethod.method,
      false,
    );

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

    return this.authTokenService.generateAuthResponse(user);
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
      const user = await this.authCredentialService.createUserWithCredential(
        value,
        valueHash,
        authMethod.method,
        true,
      );

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
    return this.authTokenService.generateAuthResponse(user);
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
      return this.authTokenService.generateAuthResponse(user);
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
    return this.authTokenService.generateAuthResponse(user);
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
          type: this.authCredentialService.toCredentialType(authType),
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
          type: this.authCredentialService.toCredentialType(authType),
          valueHash,
          valueMasked: valueMasked,
          isPrimary,
          identityId: identity.id,
        },
      });
    });

    // TODO: Send verification code to the new value
    return this.authTokenService.generateAuthResponse(user);
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

    return this.authTokenService.generateAuthResponse(credential.user);
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

  signout() {
    // Token revocation can be implemented later
    return { message: 'Signout successful' };
  }
}
