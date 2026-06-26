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
 * Applies the SerializeExcluderInterceptor to the route or controller.
 *
 * By default, includes all class-transformer properties unless explicitly marked with `@Exclude()`.
 */
export function SerializeExclude(dto: ClassConstructor) {
  return UseInterceptors(new SerializeExcluderInterceptor(dto));
}

/**
 * Intercepts the response stream to transform outgoing data into a DTO instance,
 * stripping out properties explicitly marked for exclusion.
 *
 * Useful when the default serialization strategy is to expose everything,
 * but specific sensitive fields must be hidden.
 */
export class SerializeExcluderInterceptor implements NestInterceptor {
  constructor(private dto: ClassConstructor) {}
  /**
   * Wraps the response stream, running `plainToInstance` on the returned data
   * before it is sent to the client.
   *
   * Enables implicit conversion to ensure type safety based on the DTO definition.
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> | Promise<Observable<unknown>> {
    //Run something before a request is handled by the request handler

    return next.handle().pipe(
      map((data: unknown) => {
        //Runs before response is sent out

        // Convert Decimals to numbers BEFORE plainToInstance
        // const converted = DecimalUtils.convertDecimals(data);

        const transformed = plainToInstance(this.dto, data, {
          excludeExtraneousValues: false,
          enableImplicitConversion: true,
        });

        return transformed;
      }),
    );
  }
}
