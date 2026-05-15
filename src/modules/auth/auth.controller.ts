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
import { BaseController } from '@core/base/base.controller';
import { CurrentUserId } from '@common/decorators';
import { BasicAuthGuard, JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { LoggerService } from '@core/logger/logger.service';
import { AuthService } from './auth.service';
import {
  AddSecondaryAuthDto,
  AuthSigninDto,
  AuthSignupDto,
  DevLoginDto,
  SocialAuthDto,
  UserAuthDto,
} from './dto';
import { AuthMethod } from './utils/auth-method.utils';

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

  @Post('signup')
  @ApiOperation({ summary: 'Sign up a new user' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User successfully signed up',
    type: UserAuthDto,
  })
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: AuthSignupDto) {
    return this.authService.signup(dto);
  }

  @Post('signin')
  @ApiOperation({ summary: 'Sign in an existing user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User successfully signed in',
    type: UserAuthDto,
  })
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  signin(@Body() dto: AuthSigninDto) {
    return this.authService.signin(dto);
  }

  @Post('signin-or-signup')
  @ApiOperation({ summary: 'Sign in or sign up depending on user existence' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User successfully authenticated',
    type: UserAuthDto,
  })
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  signinOrSignup(@Body() dto: AuthSigninDto) {
    return this.authService.signInOrSignUp(dto);
  }

  @Post('social')
  @ApiOperation({ summary: 'Authenticate user using a social platform' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User successfully authenticated via social provider',
    type: UserAuthDto,
  })
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  socialAuth(@Body() dto: SocialAuthDto) {
    return this.authService.socialAuth(dto);
  }

  @Post('dev-login')
  @UseGuards(BasicAuthGuard)
  @ApiOperation({ summary: 'Developer login for testing purposes' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dev user successfully authenticated',
    type: UserAuthDto,
  })
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  devLogin(@Body() dto: DevLoginDto) {
    return this.authService.devLogin(dto);
  }

  @Patch('add-phone')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add a phone number as secondary authentication' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Phone number added successfully',
    type: UserAuthDto,
  })
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  addPhone(@CurrentUserId() userId: string, @Body() dto: AddSecondaryAuthDto) {
    return this.authService.addSecondaryAuth(userId, dto, AuthMethod.PHONE);
  }

  @Patch('add-email')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add an email as secondary authentication' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email added successfully',
    type: UserAuthDto,
  })
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  addEmail(@CurrentUserId() userId: string, @Body() dto: AddSecondaryAuthDto) {
    return this.authService.addSecondaryAuth(userId, dto, AuthMethod.EMAIL);
  }

  @Post('signout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Sign out the current user' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'User successfully signed out',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  signout() {
    return this.authService.signout();
  }
}
