import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiStandardErrors, CurrentUserId } from '@common/decorators';
import { BasicAuthGuard, JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AuthService } from './auth.service';
import {
  AddSecondaryAuthRequestDto,
  AuthSigninRequestDto,
  AuthSignupRequestDto,
  DevLoginRequestDto,
  SocialAuthRequestDto,
  UserAuthResponseDto,
} from './dto';
import { AuthMethod } from './utils/auth-method.utils';

/**
 * Handles HTTP operations for user registration, authentication, and credential management.
 *
 * Most endpoints handle Firebase token exchange, social platform sign-in, and developer
 * testing sign-in. Write operations for adding secondary authentication methods and
 * sign-out require a valid JWT.
 */
@ApiTags('Auth')
@Controller({
  path: 'auth',
  version: ['1'],
})
export class AuthController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly authService: AuthService,
  ) {
    super(logger);
  }

  /**
   * Registers a new user account pending verification.
   *
   * Validates the provided Firebase token and ensures the user does not already exist with the
   * same phone or email identifier. Emits an audit log event upon successful registration.
   *
   * @param dto - Container for the Firebase UID and ID token.
   * @returns An object indicating the registered user's ID and that verification is pending.
   * @throws {ConflictException} When a verified or pending account already exists with the given credential,
   *   or when the authentication method is not supported (only phone and email are allowed).
   */
  @Post('signup')
  @ApiOperation({ summary: 'Sign up a new user' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User successfully signed up',
    type: UserAuthResponseDto,
  })
  @SerializeExpose(UserAuthResponseDto)
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: AuthSignupRequestDto) {
    return this.authService.signup(dto);
  }

  /**
   * Authenticates an existing user and issues access/refresh tokens.
   *
   * Validates the Firebase token, checks user verification status, and generates JWT tokens if verified.
   *
   * @param dto - Container for the Firebase UID and ID token.
   * @returns The user details along with JWT access and refresh tokens.
   * @throws {NotFoundException} When no account is associated with the provided credential.
   * @throws {UnauthorizedException} When the account exists but has not been verified.
   * @throws {ConflictException} When the authentication method is not supported (only phone and email are allowed).
   */
  @Post('signin')
  @ApiOperation({ summary: 'Sign in an existing user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User successfully signed in',
    type: UserAuthResponseDto,
  })
  @SerializeExpose(UserAuthResponseDto)
  @HttpCode(HttpStatus.OK)
  signin(@Body() dto: AuthSigninRequestDto) {
    return this.authService.signin(dto);
  }

  /**
   * Authenticates a user by either signing them in or registering them if they do not yet exist.
   *
   * If the credential is new, a verified user is created, and an audit log is emitted.
   *
   * @param dto - Container for the Firebase UID and ID token.
   * @returns The authenticated user details, JWT access and refresh tokens, and a flag indicating if they are a new user.
   * @throws {UnauthorizedException} When the account exists but has not been verified.
   * @throws {ConflictException} When the authentication method is not supported (only phone and email are allowed).
   */
  @Post('signin-or-signup')
  @ApiOperation({ summary: 'Sign in or sign up depending on user existence' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User successfully authenticated',
    type: UserAuthResponseDto,
  })
  @SerializeExpose(UserAuthResponseDto)
  @HttpCode(HttpStatus.OK)
  signinOrSignup(@Body() dto: AuthSigninRequestDto) {
    return this.authService.signInOrSignUp(dto);
  }

  /**
   * Authenticates or registers a user using a social media platform identifier.
   *
   * If a social identity matches, the user is authenticated. If the identity exists as a ghost identity
   * (e.g., from likes targeting their handle), it is claimed, the user is registered, and an event is
   * published via Pub/Sub to trigger matching workflows.
   *
   * @param dto - Social provider details, platform user ID, and username/handle.
   * @returns The authenticated user details and JWT access and refresh tokens.
   * @throws {ConflictException} When the social account is already linked to another active user,
   *   or represents a deleted account that requires re-verification.
   */
  @Post('social')
  @ApiOperation({ summary: 'Authenticate user using a social platform' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User successfully authenticated via social provider',
    type: UserAuthResponseDto,
  })
  @SerializeExpose(UserAuthResponseDto)
  @HttpCode(HttpStatus.OK)
  socialAuth(@Body() dto: SocialAuthRequestDto) {
    return this.authService.socialAuth(dto);
  }

  /**
   * Bypasses standard external OAuth or OTP checks to authenticate a developer during testing.
   *
   * Uses basic authentication and checks the provided identifier directly in the database.
   *
   * @param dto - The developer user's identifier (email or phone).
   * @returns The authenticated user details and JWT access and refresh tokens.
   * @throws {NotFoundException} When no user exists with the provided developer credential.
   */
  @Post('dev-login')
  @UseGuards(BasicAuthGuard)
  @ApiStandardErrors()
  @ApiOperation({ summary: 'Developer login for testing purposes' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dev user successfully authenticated',
    type: UserAuthResponseDto,
  })
  @SerializeExpose(UserAuthResponseDto)
  @HttpCode(HttpStatus.OK)
  devLogin(@Body() dto: DevLoginRequestDto) {
    return this.authService.devLogin(dto);
  }

  /**
   * Links a verified phone number to the authenticated user's account as a secondary authentication method.
   *
   * Validates the Firebase token, checks that the phone number is globally unique, and updates the identity.
   *
   * @param userId - Unique identifier of the authenticated user, extracted from the JWT.
   * @param dto - Container for the Firebase UID and ID token representing the new phone credential.
   * @returns The updated user authentication details and access/refresh tokens.
   * @throws {ConflictException} When the token does not represent a phone authentication method,
   *   or the phone number is already linked to another account.
   * @throws {NotFoundException} When the current user record cannot be found.
   */
  @Patch('add-phone')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiStandardErrors()
  @ApiOperation({ summary: 'Add a phone number as secondary authentication' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Phone number added successfully',
    type: UserAuthResponseDto,
  })
  @SerializeExpose(UserAuthResponseDto)
  @HttpCode(HttpStatus.OK)
  addPhone(
    @CurrentUserId() userId: string,
    @Body() dto: AddSecondaryAuthRequestDto,
  ) {
    return this.authService.addSecondaryAuth(userId, dto, AuthMethod.PHONE);
  }

  /**
   * Links a verified email address to the authenticated user's account as a secondary authentication method.
   *
   * Validates the Firebase token, checks that the email is globally unique, and updates the identity.
   *
   * @param userId - Unique identifier of the authenticated user, extracted from the JWT.
   * @param dto - Container for the Firebase UID and ID token representing the new email credential.
   * @returns The updated user authentication details and access/refresh tokens.
   * @throws {ConflictException} When the token does not represent an email authentication method,
   *   or the email address is already linked to another account.
   * @throws {NotFoundException} When the current user record cannot be found.
   */
  @Patch('add-email')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiStandardErrors()
  @ApiOperation({ summary: 'Add an email as secondary authentication' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email added successfully',
    type: UserAuthResponseDto,
  })
  @SerializeExpose(UserAuthResponseDto)
  @HttpCode(HttpStatus.OK)
  addEmail(
    @CurrentUserId() userId: string,
    @Body() dto: AddSecondaryAuthRequestDto,
  ) {
    return this.authService.addSecondaryAuth(userId, dto, AuthMethod.EMAIL);
  }

  /**
   * Logs out the authenticated user and emits an audit log event.
   *
   * @param userId - Unique identifier of the authenticated user, extracted from the JWT.
   * @returns An object confirming successful sign-out.
   */
  @Post('signout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiStandardErrors()
  @ApiOperation({ summary: 'Sign out the current user' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'User successfully signed out',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  signout(@CurrentUserId() userId: string) {
    return this.authService.signout(userId);
  }
}
