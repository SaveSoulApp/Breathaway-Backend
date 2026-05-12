import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { KmsModule } from 'src/core/kms/kms.module';
import { FirebaseModule } from 'src/modules/firebase/firebase.module';
import { AuthVerificationService } from './auth-verification.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityEncryptionService } from './identity-encryption.service';
import { JwtAuthModule } from './jwt.module';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, FirebaseModule, JwtAuthModule, KmsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthVerificationService,
    IdentityEncryptionService,
    JwtStrategy,
  ],
})
export class AuthModule {}
