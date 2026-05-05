import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ClientId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.clientId; // This was set by the middleware
  },
);
