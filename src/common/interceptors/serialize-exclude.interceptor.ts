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

//This annotation will expose all fields except marked at @Exclude()
export function SerializeExclude(dto: ClassConstructor) {
  return UseInterceptors(new SerializeExcluderInterceptor(dto));
}

export class SerializeExcluderInterceptor implements NestInterceptor {
  constructor(private dto: ClassConstructor) {}
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
