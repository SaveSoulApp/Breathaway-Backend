import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const DeviceId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.deviceId; // This was set by the middleware
  },
);
