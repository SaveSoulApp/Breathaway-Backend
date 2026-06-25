import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { FirebaseModule } from '@modules/firebase/firebase.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthModule } from './jwt.module';
import { AuthCredentialService } from './services/auth-credential.service';
import { AuthTokenService } from './services/auth-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    FirebaseModule,
    JwtAuthModule,
    IdentityCryptoModule,
    PubSubModule,
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
