import { IdentityType } from '@prisma/client';

export function normalizeIdentityValue(
  value: string,
  type: IdentityType,
): string {
  switch (type) {
    case IdentityType.EMAIL:
      return value.trim().toLowerCase();
    case IdentityType.PHONE:
      return value.replace(/\D/g, '');
    case IdentityType.INSTAGRAM:
    case IdentityType.LINKEDIN:
      return value.replace(/^@/, '').trim().toLowerCase();
    default:
      return value.trim().toLowerCase();
  }
}
