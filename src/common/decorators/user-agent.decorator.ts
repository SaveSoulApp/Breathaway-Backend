import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserAgentData } from '@common/interfaces';

export const UserAgent = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserAgentData => {
    const request = ctx.switchToHttp().getRequest();
    const userAgentData = request.userAgentData;

    if (!userAgentData) {
      throw new Error(
        'User-Agent data not found in request. Make sure UserAgentMiddleware is applied.',
      );
    }

    return userAgentData;
  },
);
