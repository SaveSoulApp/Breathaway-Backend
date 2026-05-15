import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { FirebaseModule } from '@modules/firebase/firebase.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthModule } from './jwt.module';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    FirebaseModule,
    JwtAuthModule,
    IdentityCryptoModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
