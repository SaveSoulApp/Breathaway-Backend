import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BaseController } from 'src/base/controller/base.controller';
import { UserId } from 'src/common/decorators';
import { BasicAuthGuard, JwtAuthGuard } from 'src/common/guards';
import { SerializeExpose } from 'src/common/interceptors';
import { LoggerService } from 'src/core/logger/logger.service';
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
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: AuthSignupDto) {
    return this.authService.signup(dto);
  }

  @Post('signin')
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  signin(@Body() dto: AuthSigninDto) {
    return this.authService.signin(dto);
  }

  @Post('signin-or-signup')
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  signinOrSignup(@Body() dto: AuthSigninDto) {
    return this.authService.signInOrSignUp(dto);
  }

  @Post('social')
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  socialAuth(@Body() dto: SocialAuthDto) {
    return this.authService.socialAuth(dto);
  }

  @Post('dev-login')
  @UseGuards(BasicAuthGuard)
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  devLogin(@Body() dto: DevLoginDto) {
    return this.authService.devLogin(dto);
  }

  @Patch('add-phone')
  @UseGuards(JwtAuthGuard)
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  addPhone(@UserId() userId: string, @Body() dto: AddSecondaryAuthDto) {
    return this.authService.addSecondaryAuth(userId, dto, AuthMethod.PHONE);
  }

  @Patch('add-email')
  @UseGuards(JwtAuthGuard)
  @SerializeExpose(UserAuthDto)
  @HttpCode(HttpStatus.OK)
  addEmail(@UserId() userId: string, @Body() dto: AddSecondaryAuthDto) {
    return this.authService.addSecondaryAuth(userId, dto, AuthMethod.EMAIL);
  }

  @Post('signout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  signout() {
    return this.authService.signout();
  }
}