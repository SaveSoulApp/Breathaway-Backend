import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

/**
 * Configures the NestJS JWT module asynchronously using configuration variables.
 *
 * Imports:
 *   - ConfigModule: Configures access to environmental configuration services.
 *
 * Exports:
 *   - JwtModule: Exposes the configured JwtModule for signing and verifying JSON Web Tokens.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '30d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [JwtModule],
})
export class JwtAuthModule {}
