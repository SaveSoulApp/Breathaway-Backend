import { ArgumentMetadata, Injectable, ValidationPipe } from '@nestjs/common';
import type { ValidationPipeOptions } from '@nestjs/common';

import { ALLOW_NON_WHITELISTED_KEY } from '@common/decorators/allow-non-whitelisted.decorator';

/**
 * Enterprise validation pipe extending NestJS ValidationPipe.
 *
 * Enforces strict input validation across the application by default:
 * - `whitelist: true` (strips undeclared properties)
 * - `forbidNonWhitelisted: true` (rejects undeclared properties with 400 Bad Request)
 * - `transform: true` with implicit type conversion
 *
 * When a target DTO class is decorated with `@AllowNonWhitelisted()`, this pipe
 * delegates to an isolated, relaxed validation pipe instance where `forbidNonWhitelisted`
 * and `whitelist` are disabled, allowing evolving third-party payloads (e.g. RevenueCat
 * webhooks) to be received without breaking API contracts.
 */
@Injectable()
export class AppValidationPipe extends ValidationPipe {
  private readonly relaxedPipe: ValidationPipe;

  constructor(options?: ValidationPipeOptions) {
    const defaultOptions: ValidationPipeOptions = {
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      ...options,
    };

    super(defaultOptions);

    this.relaxedPipe = new ValidationPipe({
      ...defaultOptions,
      whitelist: false,
      forbidNonWhitelisted: false,
    });
  }

  override async transform(value: unknown, metadata: ArgumentMetadata) {
    const isAllowedNonWhitelisted =
      metadata.metatype &&
      Reflect.getMetadata(ALLOW_NON_WHITELISTED_KEY, metadata.metatype);

    if (isAllowedNonWhitelisted) {
      return this.relaxedPipe.transform(value, metadata);
    }

    return super.transform(value, metadata);
  }
}
