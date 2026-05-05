import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const RequestId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.requestId; // This was set by the middleware
  },
);
