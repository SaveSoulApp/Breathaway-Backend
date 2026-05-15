import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { map, Observable } from 'rxjs';
// import { DecimalUtils } from '@common/utils/decimal.utils';

interface ClassConstructor {
  new (...args: any[]): {};
}

//This annotation will expose only the fields annotated with @Expose()
export function SerializeExpose(dto: ClassConstructor) {
  return UseInterceptors(new SerializeExposerInterceptor(dto));
}

export class SerializeExposerInterceptor implements NestInterceptor {
  constructor(private dto: any) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {
    //Run something before a request is handled by the request handler

    return next.handle().pipe(
      map((data: any) => {
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
