import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { FirebaseService } from '@modules/firebase/firebase.service';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { Injectable } from '@nestjs/common';
import {
  AccountAlreadyExistsException,
  AccountNotFoundException,
  AuthTypeMismatchException,
  DeletedAccountReverificationException,
  RegistrationPendingException,
  SocialAccountAlreadyLinkedException,
  UnsupportedAuthMethodException,
  UnverifiedAccountException,
  UserNotFoundException,
} from './application/exceptions';
import { IdentityType, User } from '@prisma/client';
import {
  AddSecondaryAuthRequestDto,
  AuthSigninRequestDto,
  AuthSignupRequestDto,
  DevLoginRequestDto,
  SocialAuthRequestDto,
} from './dto';
import { AuthCredentialService } from './services/auth-credential.service';
import { AuthTokenService } from './services/auth-token.service';
import { AuthMethod } from './utils/auth-method.utils';
import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Orchestrates the full authentication lifecycle — sign-up, sign-in, social auth,
 * and secondary credential linking — by coordinating Firebase token validation,
 * identity hashing via IdentityCryptoService, and JWT issuance via AuthTokenService.
 *
 * All credential values (phone numbers, emails) are normalized and hashed before
 * any persistence or lookup to ensure consistent canonical representations across
 * the Auth and Likes flows.
 */
@Injectable()
export class AuthService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly firebaseAdmin: FirebaseService,
    private readonly encryptionService: IdentityCryptoService,
    private readonly authCredentialService: AuthCredentialService,
    private readonly authTokenService: AuthTokenService,
    private readonly pubSubPublisher: PubSubPublisherService,
  ) {
    super(logger);
  }

  /**
   * Registers a new user account pending OTP verification.
   *
   * Validates the Firebase token, hashes the identifier for deduplication, and rejects
   * if a verified or pending-verification account already exists. Emits a USER_REGISTERED
   * audit event on success. The created account is unverified until OTP confirmation.
   *
   * @param dto - Firebase UID and ID token representing the sign-up credential.
   * @returns An object containing the new user's ID and a `pending_verification` status.
   * @throws {ConflictException} When a verified account already exists for this credential.
   * @throws {ConflictException} When the credential represents an unsupported auth method
   *   (only PHONE and EMAIL are accepted).
   * @throws {ConflictException} When registration is pending verification for the same credential.
   */
  async signup(dto: AuthSignupRequestDto) {
    const ctx: Record<string, unknown> = { uid: dto.uid };
    this.logger.log('Signup started', { ...ctx, step: 'init' });

    const { authMethod } = await this.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );
    this.ensurePhoneOrEmail(authMethod.method);

    const value = authMethod.identifier; // raw phone or email
    const identityType =
      authMethod.method === AuthMethod.PHONE
        ? IdentityType.PHONE
        : IdentityType.EMAIL;

    Object.assign(ctx, { method: authMethod.method, identityType });
    this.logger.debug('Firebase token validated', {
      ...ctx,
      step: 'firebase_validation',
    });

    // Normalize before hashing so Auth and Likes flows produce the same hash
    const { publicValueHash } = await this.encryptionService.processPublicValue(
      value,
      identityType,
    );
    this.logger.debug('Credential hashed', { ...ctx, step: 'hash_credential' });

    // Check global uniqueness via AuthCredential — query active records only.
    // valueHash is part of @@unique([valueHash, deletedAt]), so we use findFirst
    // with deletedAt: null to find the live (non-soft-deleted) credential.
    const existingCred = await this.prisma.authCredential.findFirst({
      where: { valueHash: publicValueHash, deletedAt: null },
      select: {
        userId: true,
        identityId: true,
      },
    });

    if (existingCred) {
      // Check the linked Identity for verification status
      const existingIdentity = await this.prisma.identity.findUnique({
        where: { id: existingCred.identityId },
        select: { isVerified: true },
      });
      if (existingIdentity?.isVerified) {
        this.logger.warn('Signup failed: account already exists', {
          ...ctx,
          step: 'duplicate_check',
        });
        throw new AccountAlreadyExistsException();
      }
      // Unverified – resend OTP (handled by the controller / frontend)
      this.logger.warn('Signup failed: account pending verification', {
        ...ctx,
        step: 'duplicate_check',
      });
      throw new RegistrationPendingException();
    }
    this.logger.debug('Duplicate check passed', {
      ...ctx,
      step: 'duplicate_check',
    });

    const { user } = await this.authCredentialService.createUserWithCredential(
      value,
      authMethod.method,
      false,
    );
    this.logger.debug('User provisioned', {
      ...ctx,
      step: 'create_user',
      userId: user.id,
    });

    // TODO: Send OTP / magic link to the value
    this.emitAuditLog({
      actionType: AuditActionType.USER_REGISTERED,
      userId: user.id,
      metadata: { method: authMethod.method },
    });

    this.logger.log('Signup complete', {
      ...ctx,
      step: 'complete',
      userId: user.id,
    });
    return { userId: user.id, status: 'pending_verification' };
  }

  /**
   * Authenticates an existing verified user and issues a JWT access token.
   *
   * Looks up the credential by hashed identifier. Rejects unverified accounts with
   * an UnauthorizedException to signal the frontend to show the verification screen.
   *
   * @param dto - Firebase UID and ID token representing the sign-in credential.
   * @returns The user's ID and a signed JWT access token.
   * @throws {NotFoundException} When no account is registered for the provided credential.
   * @throws {UnauthorizedException} When the account exists but has not completed OTP verification.
   * @throws {ConflictException} When the credential represents an unsupported auth method.
   */
  async signin(dto: AuthSigninRequestDto) {
    const ctx: Record<string, unknown> = { uid: dto.uid };
    this.logger.log('Signin started', { ...ctx, step: 'init' });

    const { authMethod } = await this.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );
    this.ensurePhoneOrEmail(authMethod.method);

    const value = authMethod.identifier;
    const identityType =
      authMethod.method === AuthMethod.PHONE
        ? IdentityType.PHONE
        : IdentityType.EMAIL;
    const { publicValueHash: valueHash } =
      await this.encryptionService.processPublicValue(value, identityType);

    Object.assign(ctx, { method: authMethod.method, identityType });
    this.logger.debug('Firebase token validated and credential hashed', {
      ...ctx,
      step: 'firebase_validation',
    });

    const credential = await this.prisma.authCredential.findFirst({
      where: { valueHash, deletedAt: null },
      select: {
        userId: true,
        identityId: true,
      },
    });

    if (!credential) {
      this.logger.warn('Signin failed: account not found', {
        ...ctx,
        step: 'credential_lookup',
      });
      throw new AccountNotFoundException();
    }

    const credIdentity = await this.prisma.identity.findUnique({
      where: { id: credential.identityId },
      select: { isVerified: true },
    });

    if (!credIdentity?.isVerified) {
      // Resend OTP / magic link – frontend should show verification screen
      this.logger.warn('Signin failed: account unverified', {
        ...ctx,
        step: 'credential_lookup',
        userId: credential.userId,
      });
      throw new UnverifiedAccountException();
    }
    this.logger.debug('Credential verified', {
      ...ctx,
      step: 'credential_lookup',
      userId: credential.userId,
    });

    // At this point the user exists and is verified.
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: credential.userId },
    });
    this.logger.debug('User record fetched', {
      ...ctx,
      step: 'fetch_user',
      userId: user.id,
    });

    this.logger.log('Signin complete', {
      ...ctx,
      step: 'complete',
      userId: user.id,
    });
    return this.authTokenService.generateAuthResponse(user, {
      authMethod: authMethod.method,
      publicValueHash: valueHash,
    });
  }

  /**
   * Performs a combined sign-in or sign-up flow for phone/email credentials.
   *
   * If the credential is new, creates a verified account and emits a USER_REGISTERED audit event.
   * If the credential belongs to an unverified existing account, throws UnauthorizedException.
   * Returns an `isNewUser` flag so clients can route to onboarding or home.
   *
   * @param dto - Firebase UID and ID token for the authenticating credential.
   * @returns The user's ID, signed JWT access token, and an `isNewUser` boolean.
   * @throws {UnauthorizedException} When the credential belongs to an existing unverified account.
   * @throws {ConflictException} When the credential represents an unsupported auth method.
   */
  async signInOrSignUp(dto: AuthSigninRequestDto) {
    const ctx: Record<string, unknown> = { uid: dto.uid };
    this.logger.log('Sign-in or sign-up started', { ...ctx, step: 'init' });

    const { authMethod } = await this.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );
    this.ensurePhoneOrEmail(authMethod.method);

    const value = authMethod.identifier;
    const identityType =
      authMethod.method === AuthMethod.PHONE
        ? IdentityType.PHONE
        : IdentityType.EMAIL;
    const { publicValueHash: valueHash } =
      await this.encryptionService.processPublicValue(value, identityType);

    Object.assign(ctx, { method: authMethod.method, identityType });
    this.logger.debug('Firebase token validated and credential hashed', {
      ...ctx,
      step: 'firebase_validation',
    });

    const credential = await this.prisma.authCredential.findFirst({
      where: { valueHash, deletedAt: null },
      select: {
        userId: true,
        identityId: true,
      },
    });

    if (!credential) {
      const { user, normalizedHash } =
        await this.authCredentialService.createUserWithCredential(
          value,
          authMethod.method,
          true,
        );

      this.logger.debug('New user provisioned', {
        ...ctx,
        step: 'create_user',
        userId: user.id,
        isNewUser: true,
      });

      this.emitAuditLog({
        actionType: AuditActionType.USER_REGISTERED,
        userId: user.id,
        metadata: { method: authMethod.method },
      });

      this.logger.log('Sign-in or sign-up complete', {
        ...ctx,
        step: 'complete',
        userId: user.id,
        isNewUser: true,
      });
      return this.authTokenService.generateAuthResponse(user, {
        authMethod: authMethod.method,
        publicValueHash: normalizedHash,
        isNewUser: true,
      });
    }

    // Existing credential — check verification status via linked Identity
    const credIdentity = await this.prisma.identity.findUnique({
      where: { id: credential.identityId },
      select: { isVerified: true },
    });

    if (!credIdentity?.isVerified) {
      this.logger.warn('Sign-in-or-sign-up failed: account unverified', {
        ...ctx,
        step: 'credential_lookup',
        userId: credential.userId,
      });
      throw new UnverifiedAccountException();
    }
    this.logger.debug('Existing credential verified', {
      ...ctx,
      step: 'credential_lookup',
      userId: credential.userId,
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: credential.userId },
    });

    this.logger.log('Sign-in or sign-up complete', {
      ...ctx,
      step: 'complete',
      userId: user.id,
      isNewUser: false,
    });
    return this.authTokenService.generateAuthResponse(user, {
      authMethod: authMethod.method,
      publicValueHash: valueHash,
      isNewUser: false,
    });
  }

  /**
   * Authenticates or registers a user via a social media platform identity.
   *
   * Looks up the identity by hashed platform user ID. If found and owned, logs the user in.
   * If a ghost identity exists (userId=null, created from prior likes activity), claims it
   * and publishes an IDENTITY_CLAIMED Pub/Sub event for match resolution. No AuthCredential
   * is stored for social identities — the platformIdHash is the authoritative lookup key.
   *
   * @param dto - Social platform type, platform user ID, and public handle.
   * @returns The user's ID, signed JWT access token, and an `isNewUser` boolean.
   * @throws {ConflictException} When the platform account is already linked to another active user.
   * @throws {ConflictException} When the account has been deleted and requires re-verification.
   */
  async socialAuth(dto: SocialAuthRequestDto) {
    const { type, platformUserId, handle } = dto;
    const ctx: Record<string, unknown> = { type };
    this.logger.log('Social auth started', { ...ctx, step: 'init' });

    // Normalize and hash via the same helpers used everywhere else so that
    // platformIdHash and publicValueHash are always canonical values.
    const platformIdData =
      await this.encryptionService.processPlatformId(platformUserId);

    Object.assign(ctx, { platformIdHash: platformIdData.platformIdHash });
    this.logger.debug('Platform ID hashed', {
      ...ctx,
      step: 'platform_id_hash',
    });

    const identity = await this.prisma.identity.findFirst({
      where: { type, platformIdHash: platformIdData.platformIdHash },
      select: { id: true, userId: true, isVerified: true },
    });

    if (identity) {
      if (identity.userId === null) {
        this.logger.warn(
          'Social auth failed: deleted account requires reverification',
          {
            ...ctx,
            step: 'identity_lookup',
            identityId: identity.id,
          },
        );
        throw new DeletedAccountReverificationException();
      }
      // User exists and is verified – log them in
      this.logger.debug('Existing social user found', {
        ...ctx,
        step: 'identity_lookup',
        identityId: identity.id,
        userId: identity.userId,
      });
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: identity.userId },
      });
      this.logger.log('Social auth complete', {
        ...ctx,
        step: 'complete',
        userId: user.id,
        isNewUser: false,
      });
      return this.authTokenService.generateAuthResponse(user, {
        authMethod: type,
        platformIdHash: platformIdData.platformIdHash,
        isNewUser: false,
      });
    }

    this.logger.debug(
      'No existing identity — proceeding with new social registration',
      {
        ...ctx,
        step: 'identity_lookup',
      },
    );

    // processPublicValue normalizes handle (strips leading '@', lowercases) and
    // encryptPublicValue before hashing – consistent with the likes flow.
    const publicValueData = await this.encryptionService.processPublicValue(
      handle,
      type as IdentityType,
    );
    this.logger.debug('Public value hashed', {
      ...ctx,
      step: 'public_value_hash',
    });

    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        // New social identity
        const newUser = await tx.user.create({
          data: {
            notificationPreference: {
              create: {},
            },
          },
        });

        const ghostIdentity = await tx.identity.findUnique({
          where: {
            type_publicValueHash: {
              type,
              publicValueHash: publicValueData.publicValueHash,
            },
          },
        });

        if (ghostIdentity) {
          if (ghostIdentity.userId !== null) {
            this.logger.warn(
              'Social auth failed: handle already linked to another user',
              {
                ...ctx,
                step: 'create_social_user',
                existingUserId: ghostIdentity.userId,
              },
            );
            throw new SocialAccountAlreadyLinkedException();
          }

          await tx.identity.update({
            where: { id: ghostIdentity.id },
            data: {
              userId: newUser.id,
              isVerified: true,
              verifiedAt: DateUtil.now(),
              ...publicValueData,
              ...platformIdData,
            },
          });
          this.logger.debug('Ghost identity claimed', {
            ...ctx,
            step: 'create_social_user',
            identityId: ghostIdentity.id,
            userId: newUser.id,
          });
        } else {
          const newIdentity = await tx.identity.create({
            data: {
              type,
              ...publicValueData,
              ...platformIdData,
              userId: newUser.id,
              isVerified: true, // social accounts are pre‑verified
              verifiedAt: DateUtil.now(),
            },
          });
          this.logger.debug('New social identity created', {
            ...ctx,
            step: 'create_social_user',
            identityId: newIdentity.id,
            userId: newUser.id,
          });
        }

        return newUser;
      });
    } catch (err) {
      // Domain exceptions (e.g. SocialAccountAlreadyLinkedException) already have a
      // warn log at the throw site — only log at error for unexpected infra failures.
      if (err instanceof DomainException) throw err;
      this.logger.error('Social auth transaction failed', {
        ...ctx,
        step: 'create_social_user',
        err: serializeError(err),
      });
      throw err;
    }

    // A ghost identity was claimed — trigger match resolution so any pending
    // likes that targeted this social handle are evaluated now that the
    // identity has an owner.
    this.pubSubPublisher
      .publish(PubSubTopic.IDENTITY_WORKFLOWS, PubSubEvent.IDENTITY_CLAIMED, {
        userId: user.id,
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to publish IDENTITY_CLAIMED event', {
          ...ctx,
          step: 'pubsub_publish',
          userId: user.id,
          err: serializeError(err),
        });
      });
    this.logger.debug('IDENTITY_CLAIMED event dispatched', {
      ...ctx,
      step: 'pubsub_publish',
      userId: user.id,
    });

    // No AuthCredential for social types.
    this.emitAuditLog({
      actionType: AuditActionType.USER_REGISTERED,
      userId: user.id,
      metadata: { method: type },
    });

    this.logger.log('Social auth complete', {
      ...ctx,
      step: 'complete',
      userId: user.id,
      isNewUser: true,
    });
    return this.authTokenService.generateAuthResponse(user, {
      authMethod: type,
      platformIdHash: platformIdData.platformIdHash,
      isNewUser: true,
    });
  }

  /**
   * Links a verified secondary phone or email credential to an existing user account.
   *
   * Validates that the Firebase token matches the expected `authType`, enforces global
   * uniqueness of the credential, and creates an Identity + AuthCredential within a
   * transaction. The credential is set as primary if the user has no existing primary.
   * The linked credential will be unverified until OTP confirmation.
   *
   * @param userId - UUID of the currently authenticated user.
   * @param dto - Firebase UID and ID token representing the new secondary credential.
   * @param authType - Expected authentication method: must be PHONE or EMAIL.
   * @returns The user's ID and a refreshed JWT access token.
   * @throws {ConflictException} When the Firebase token's method does not match `authType`.
   * @throws {ConflictException} When the credential is already linked to another account.
   * @throws {NotFoundException} When the authenticated user record cannot be found.
   */
  async addSecondaryAuth(
    userId: string,
    dto: AddSecondaryAuthRequestDto,
    authType: AuthMethod.PHONE | AuthMethod.EMAIL,
  ) {
    const ctx: Record<string, unknown> = { userId, authType };
    this.logger.log('Add secondary auth started', { ...ctx, step: 'init' });

    // 1. Validate Firebase token and get identifier
    const { authMethod } = await this.validateFirebaseToken(
      dto.uid,
      dto.uidToken,
    );
    this.ensurePhoneOrEmail(authMethod.method);
    this.logger.debug('Firebase token validated', {
      ...ctx,
      step: 'firebase_validation',
      method: authMethod.method,
    });

    if (
      (authType === AuthMethod.PHONE &&
        authMethod.method !== AuthMethod.PHONE) ||
      (authType === AuthMethod.EMAIL && authMethod.method !== AuthMethod.EMAIL)
    ) {
      this.logger.warn('Add secondary auth failed: auth type mismatch', {
        ...ctx,
        step: 'type_check',
        method: authMethod.method,
      });
      throw new AuthTypeMismatchException();
    }
    this.logger.debug('Auth type check passed', { ...ctx, step: 'type_check' });

    const value = authMethod.identifier;
    const identityType =
      authType === AuthMethod.PHONE ? IdentityType.PHONE : IdentityType.EMAIL;

    // Normalize before hashing – must match what processPublicValue produces
    const publicValueData = await this.encryptionService.processPublicValue(
      value,
      identityType,
    );
    this.logger.debug('Credential hashed', {
      ...ctx,
      step: 'hash_credential',
      identityType,
    });

    // 2. Check global uniqueness — active credentials only
    const existingCred = await this.prisma.authCredential.findFirst({
      where: { valueHash: publicValueData.publicValueHash, deletedAt: null },
    });
    if (existingCred) {
      this.logger.warn('Add secondary auth failed: credential already in use', {
        ...ctx,
        step: 'uniqueness_check',
      });
      throw new AccountAlreadyExistsException();
    }
    this.logger.debug('Uniqueness check passed', {
      ...ctx,
      step: 'uniqueness_check',
    });

    // 3. Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      this.logger.warn('Add secondary auth failed: user not found', {
        ...ctx,
        step: 'user_lookup',
      });
      throw new UserNotFoundException();
    }
    this.logger.debug('User found', { ...ctx, step: 'user_lookup' });

    // 4. Encrypt and create Identity + AuthCredential atomically
    try {
      await this.prisma.$transaction(async (tx) => {
        const existingIdentity = await tx.identity.findUnique({
          where: {
            type_publicValueHash: {
              type: this.authCredentialService.toCredentialType(authType),
              publicValueHash: publicValueData.publicValueHash,
            },
          },
        });

        let identityId: string;

        if (existingIdentity) {
          if (existingIdentity.userId !== null) {
            this.logger.warn(
              'Add secondary auth failed: identity already linked to another user',
              {
                ...ctx,
                step: 'link_credential',
                existingUserId: existingIdentity.userId,
              },
            );
            throw new SocialAccountAlreadyLinkedException();
          }

          const updatedIdentity = await tx.identity.update({
            where: { id: existingIdentity.id },
            data: {
              userId: user.id,
              isVerified: false,
              ...publicValueData,
            },
          });
          identityId = updatedIdentity.id;
          this.logger.debug('Ghost identity claimed for secondary auth', {
            ...ctx,
            step: 'link_credential',
            identityId,
          });
        } else {
          const newIdentity = await tx.identity.create({
            data: {
              type: this.authCredentialService.toCredentialType(authType),
              ...publicValueData,
              userId: user.id,
              isVerified: false, // will need verification
            },
          });
          identityId = newIdentity.id;
          this.logger.debug('New identity created for secondary auth', {
            ...ctx,
            step: 'link_credential',
            identityId,
          });
        }

        // Determine if this should be primary (if user has no primary credential yet, set true)
        const primaryCount = await tx.authCredential.count({
          where: { userId: user.id, isPrimary: true },
        });
        const isPrimary = primaryCount === 0;

        await tx.authCredential.create({
          data: {
            userId: user.id,
            type: this.authCredentialService.toCredentialType(authType),
            valueHash: publicValueData.publicValueHash,
            valueMasked: publicValueData.publicValueMasked ?? null,
            isPrimary,
            identityId: identityId,
          },
        });
        this.logger.debug('Auth credential linked', {
          ...ctx,
          step: 'link_credential',
          identityId,
          isPrimary,
        });
      });
    } catch (err) {
      // Domain exceptions (e.g. SocialAccountAlreadyLinkedException) already have a
      // warn log at the throw site — only log at error for unexpected infra failures.
      if (err instanceof DomainException) throw err;
      this.logger.error('Add secondary auth transaction failed', {
        ...ctx,
        step: 'link_credential',
        err: serializeError(err),
      });
      throw err;
    }

    // TODO: Send verification code to the new value
    this.logger.log('Add secondary auth complete', {
      ...ctx,
      step: 'complete',
    });
    return this.authTokenService.generateAuthResponse(user, {
      authMethod: authType,
      publicValueHash: publicValueData.publicValueHash,
      isSecondaryAuth: true,
    });
  }

  /**
   * Authenticates a developer or test user without Firebase token validation.
   *
   * Normalizes the identifier (lowercases emails, strips non-digits from phone numbers)
   * before hashing for lookup. Only intended for use in non-production environments
   * protected by BasicAuthGuard at the controller layer.
   *
   * @param dto - A pre-seeded email or phone number from the test database.
   * @returns The user's ID and a signed JWT access token.
   * @throws {NotFoundException} When no credential matches the provided identifier.
   */
  async devLogin(dto: DevLoginRequestDto) {
    const value = dto.identifier;

    // Normalize before hashing so it matches the canonical hash stored at
    // signup time. Phone numbers are stripped of non-digits; emails are
    // lowercased. Use a simple heuristic: if it contains '@' it's an email.
    const identityType = value.includes('@')
      ? IdentityType.EMAIL
      : IdentityType.PHONE;

    const ctx = { identityType };
    this.logger.debug('Dev login started', { ...ctx, step: 'init' });

    const { publicValueHash: valueHash } =
      await this.encryptionService.processPublicValue(value, identityType);
    this.logger.debug('Credential hashed', { ...ctx, step: 'hash_credential' });

    const credential = await this.prisma.authCredential.findFirst({
      where: { valueHash },
      include: { user: true },
    });

    if (!credential) {
      this.logger.warn('Dev login failed: credential not found', {
        ...ctx,
        step: 'credential_lookup',
      });
      throw new UserNotFoundException();
    }

    this.logger.debug('Dev login complete', {
      ...ctx,
      step: 'complete',
      userId: credential.user.id,
    });
    return this.authTokenService.generateAuthResponse(credential.user, {
      authMethod: 'DEV_LOGIN',
      publicValueHash: valueHash,
    });
  }

  // ---------- Common Helpers ----------
  private async validateFirebaseToken(uid: string, uidToken: string) {
    const { authMethod, decodedToken } =
      await this.firebaseAdmin.validateFirebaseToken(uid, uidToken);
    return { authMethod, decodedToken };
  }

  private ensurePhoneOrEmail(method: AuthMethod) {
    if (method !== AuthMethod.PHONE && method !== AuthMethod.EMAIL) {
      this.logger.warn('Auth method unsupported', {
        method,
        step: 'method_validation',
      });
      throw new UnsupportedAuthMethodException();
    }
  }

  /**
   * Records a user logout event and emits a USER_LOGOUT audit log.
   *
   * JWT tokens are stateless and are not actively invalidated — callers must discard
   * the token client-side. Token revocation (e.g., via a denylist) can be layered on here.
   *
   * @param userId - UUID of the user signing out, extracted from the JWT by the controller.
   * @returns A confirmation message object.
   */
  signout(userId: string) {
    this.logger.log('User signed out', { userId, step: 'complete' });
    // Token revocation can be implemented later
    this.emitAuditLog({
      actionType: AuditActionType.USER_LOGOUT,
      userId: userId,
    });
    return { message: 'Signout successful' };
  }
}
