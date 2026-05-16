import { BaseService } from '@core/base/base.service';
import { LoggerService } from '@core/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { nanoid } from 'nanoid';

@Injectable()
export class AuthTokenService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
  }

  generateAuthResponse(user: User) {
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
}
