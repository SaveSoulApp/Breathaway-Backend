import { ClientIdentityKey } from '@common/enums/client-identity-key.enum';
import { ClientIdentityData } from '@common/interfaces/client-identity.interface';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ClientIdentity = createParamDecorator(
  (data: ClientIdentityKey | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const identity: ClientIdentityData = request.clientIdentity;

    // Return specific property if requested, otherwise return the whole object
    if (data && identity) {
      return identity[data];
    }

    return identity;
  },
);
