import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { FirebaseModule } from '@modules/firebase/firebase.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthModule } from './jwt.module';
import { AuthCredentialService } from './services/auth-credential.service';
import { AuthTokenService } from './services/auth-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Encapsulates the authentication bounded context, managing user sign-up, sign-in,
 * social platform integrations, and secondary credential setups.
 *
 * Imports:
 *   - PassportModule: Configures the strategy execution environment for NestJS guards.
 *   - FirebaseModule: Provides services for verifying identity tokens with Firebase.
 *   - JwtAuthModule: Registers the asymmetric/symmetric token generation configurations.
 *   - IdentityCryptoModule: Provides hashing and encryption methods for storing privacy-safe credentials.
 */
@Module({
  imports: [
    PassportModule,
    FirebaseModule,
    JwtAuthModule,
    IdentityCryptoModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AuthCredentialService,
    AuthTokenService,
  ],
})
export class AuthModule {}
