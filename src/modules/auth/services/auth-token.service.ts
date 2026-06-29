import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { AuditActionType } from '@modules/audit/dto';
import { nanoid } from 'nanoid';

/**
 * Handles JWT access token generation and related session audit logging.
 *
 * Interacts with ConfigService to retrieve JWT claims configuration and
 * relies on JwtService for token signing operations.
 */
@Injectable()
export class AuthTokenService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
  }

  /**
   * Generates a cryptographically signed JWT access token for a user and emits a login audit event.
   *
   * Configures standard JWT claims (sub, iss, aud) and assigns a unique identifier (jti)
   * via nanoid. Emits an asynchronous audit log capturing the user login event.
   *
   * @param user - The User entity requesting authorization.
   * @param metadata - Optional key-value pairs representing request context (e.g. IP address or device type).
   * @returns An object containing the signed access token and the user's ID.
   */
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
