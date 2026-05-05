import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { FirebaseModule } from 'src/modules/firebase/firebase.module';
import { AuthVerificationService } from './auth-verification.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthModule } from './jwt.module';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, FirebaseModule, JwtAuthModule],
  controllers: [AuthController],
  providers: [AuthService, AuthVerificationService, JwtStrategy],
})
export class AuthModule {}
