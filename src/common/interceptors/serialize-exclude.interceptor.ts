import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { map, Observable } from 'rxjs';
// import { DecimalUtils } from 'src/common/utils/decimal.utils';

interface ClassConstructor {
  new (...args: any[]): {};
}

//This annotation will expose all fields except marked at @Exclude()
export function SerializeExclude(dto: ClassConstructor) {
  return UseInterceptors(new SerializeExcluderInterceptor(dto));
}

export class SerializeExcluderInterceptor implements NestInterceptor {
  constructor(private dto: any) {}
  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {
    //Run something before a request is handled by the request handler

    return next.handle().pipe(
      map((data: any) => {
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
