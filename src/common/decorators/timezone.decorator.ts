import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Timezone = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    let timezone = request.timezone; // Set by middleware

    return timezone || 'UTC';
  },
);
