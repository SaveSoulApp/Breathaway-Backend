import { ClientIdentityKey } from '@common/enums';
import { ClientIdentityData } from '@common/interfaces';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ClientIdentity = createParamDecorator(
  (data: ClientIdentityKey | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ clientIdentity: ClientIdentityData }>();
    const identity: ClientIdentityData = request.clientIdentity;

    // Return specific property if requested, otherwise return the whole object
    if (data && identity) {
      return identity[data];
    }

    return identity;
  },
);
