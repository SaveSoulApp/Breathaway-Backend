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

//This annotation will expose only the fields annotated with @Expose()
export function SerializeExpose(dto: ClassConstructor) {
  return UseInterceptors(new SerializeExposerInterceptor(dto));
}

export class SerializeExposerInterceptor implements NestInterceptor {
  constructor(private dto: ClassConstructor) {}

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
