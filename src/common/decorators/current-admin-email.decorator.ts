import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { AdminUserIdentity } from '@modules/admin/guards/admin-oidc-auth.guard';

export interface AdminAuthenticatedRequest extends Request {
  adminUser?: AdminUserIdentity;
}

/**
 * Extracts the authenticated GCP administrator's email address from the request context.
 *
 * Populated by `AdminOidcAuthGuard` into `request.adminUser.email`.
 */
export const CurrentAdminEmail = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<AdminAuthenticatedRequest>();

    return request.adminUser?.email;
  },
);
