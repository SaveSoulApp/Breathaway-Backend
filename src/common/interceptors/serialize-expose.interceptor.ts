import { plainToInstance } from 'class-transformer';
import { map, Observable } from 'rxjs';

import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';

interface ClassConstructor {
  new (...args: unknown[]): object;
}

/**
 * Applies the SerializeExposerInterceptor to the route or controller.
 *
 * Enforces a strict serialization strategy where only properties explicitly marked
 * with `@Expose()` are included in the response.
 */
export function SerializeExpose(dto: ClassConstructor) {
  return UseInterceptors(new SerializeExposerInterceptor(dto));
}

/**
 * Intercepts the response stream to transform outgoing data into a DTO instance,
 * stripping away all extraneous properties not explicitly exposed.
 *
 * Enforces a default-deny serialization strategy to prevent accidental data leaks.
 */
export class SerializeExposerInterceptor implements NestInterceptor {
  constructor(private dto: ClassConstructor) {}

  /**
   * Wraps the response stream, applying strict `plainToInstance` transformation
   * on the returned data to ensure only `@Expose()` fields remain.
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> | Promise<Observable<unknown>> {
    //Run something before a request is handled by the request handler

    return next.handle().pipe(
      map((data: unknown) => {
        // Convert Decimals to numbers BEFORE plainToInstance
        // const converted = DecimalUtils.convertDecimals(data);

        // Then transform to DTO
        return plainToInstance(this.dto, data, {
          excludeExtraneousValues: true,
        });
      }),
    );
  }
}
