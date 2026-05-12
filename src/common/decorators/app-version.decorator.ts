import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const AppVersion = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const userAgentData = request.userAgentData;

    if (!userAgentData) {
      throw new Error(
        'User-Agent data not found in request. Make sure UserAgentMiddleware is applied.',
      );
    }

    return userAgentData.version;
  },
);
