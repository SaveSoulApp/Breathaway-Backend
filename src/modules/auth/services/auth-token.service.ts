import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';
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

  generateAuthResponse(user: User, metadata?: Record<string, unknown>) {
    const payload = {
      sub: user.id,
      iss: this.configService.get<string>('JWT_ISSUER'),
      aud: this.configService.get<string>('JWT_AUDIENCE'),
      jti: nanoid(24),
    };

    const accessToken = this.jwtService.sign(payload);

    this.emitAuditLog({
      actionType: AuditActionType.USER_LOGIN,
      userId: user.id,
      ...(metadata && { metadata }),
    });

    return {
      access_token: accessToken,
      user_id: user.id,
    };
  }
}
