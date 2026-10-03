import { Injectable } from '@nestjs/common';
import { AuthCredentialType, IdentityType } from '@prisma/client';
import { parsePhoneNumberWithError } from 'libphonenumber-js';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

import {
  ResolvedEmailContact,
  ResolvedPhoneContact,
} from './interfaces/resolved-contact.interface';

/**
 * Service responsible for resolving and decrypting communication channels (Email, Phone)
 * for notification recipients.
 *
 * Encapsulates the envelope encryption queries against AuthCredential and Identity tables,
 * delegating cryptographic unwrapping and AES-GCM decryption to IdentityCryptoService,
 * and normalizing contact details (E.164 standardization, lowercase email trimming).
 */
@Injectable()
export class NotificationRecipientResolverService extends BaseService {
  constructor(
    loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly identityCryptoService: IdentityCryptoService,
  ) {
    super(loggerService);
  }

  /**
   * Resolves and decrypts email addresses and user profile names for the provided user IDs.
   * Prioritizes AuthCredential (type=EMAIL) and falls back to verified Identity (type=EMAIL).
   *
   * @param userIds - Array of target user IDs.
   * @returns Map of userId -> ResolvedEmailContact.
   */
  async resolveEmails(
    userIds: string[],
  ): Promise<Map<string, ResolvedEmailContact>> {
    const resolvedMap = new Map<string, ResolvedEmailContact>();

    if (!userIds || userIds.length === 0) {
      return resolvedMap;
    }

    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) {
      return resolvedMap;
    }

    // 1. Query via AuthCredential (type=EMAIL)
    const credentials = await this.prisma.authCredential.findMany({
      where: {
        userId: { in: uniqueUserIds },
        type: AuthCredentialType.EMAIL,
        deletedAt: null,
      },
      include: {
        identity: {
          select: {
            publicValueCiphertext: true,
            publicValueIv: true,
            publicValueTag: true,
            publicValueWrappedKey: true,
            publicValueKeyId: true,
          },
        },
        user: {
          select: {
            profile: {
              select: {
                firstName: true,
              },
            },
          },
        },
      },
    });

    for (const cred of credentials) {
      if (!cred.identity) continue;

      try {
        const email = await this.identityCryptoService.decryptPublicValue(
          cred.identity,
        );
        if (email && email.trim() !== '') {
          resolvedMap.set(cred.userId, {
            userId: cred.userId,
            email: email.trim().toLowerCase(),
            firstName: cred.user?.profile?.firstName,
          });
        }
      } catch (err) {
        this.logger.error(
          'Failed to decrypt user email address from AuthCredential',
          {
            userId: cred.userId,
            step: 'decrypt_email_credential',
            err: serializeError(err),
          },
        );
      }
    }

    // 2. Fallback: Query Identity records for remaining users
    const remainingUserIds = uniqueUserIds.filter((id) => !resolvedMap.has(id));
    if (remainingUserIds.length > 0) {
      const identities = await this.prisma.identity.findMany({
        where: {
          userId: { in: remainingUserIds },
          type: IdentityType.EMAIL,
          isVerified: true,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          userId: true,
          publicValueCiphertext: true,
          publicValueIv: true,
          publicValueTag: true,
          publicValueWrappedKey: true,
          publicValueKeyId: true,
          user: {
            select: {
              profile: {
                select: {
                  firstName: true,
                },
              },
            },
          },
        },
      });

      for (const identity of identities) {
        if (!identity.userId || resolvedMap.has(identity.userId)) continue;

        try {
          const email = await this.identityCryptoService.decryptPublicValue({
            publicValueCiphertext: identity.publicValueCiphertext,
            publicValueIv: identity.publicValueIv,
            publicValueTag: identity.publicValueTag,
            publicValueWrappedKey: identity.publicValueWrappedKey,
            publicValueKeyId: identity.publicValueKeyId,
          });
          if (email && email.trim() !== '') {
            resolvedMap.set(identity.userId, {
              userId: identity.userId,
              email: email.trim().toLowerCase(),
              firstName: identity.user?.profile?.firstName,
            });
          }
        } catch (err) {
          this.logger.error(
            'Failed to decrypt user email address from Identity',
            {
              userId: identity.userId,
              step: 'decrypt_email_identity',
              err: serializeError(err),
            },
          );
        }
      }
    }

    return resolvedMap;
  }

  /**
   * Resolves and decrypts verified phone numbers and user profile names for the provided user IDs.
   * Normalizes values to both digits-only E.164 (e.g. "919876543210") and formatted E.164 (e.g. "+919876543210").
   * Prioritizes AuthCredential (type=PHONE) and falls back to verified Identity (type=PHONE).
   *
   * @param userIds - Array of target user IDs.
   * @returns Map of userId -> ResolvedPhoneContact.
   */
  async resolvePhoneNumbers(
    userIds: string[],
  ): Promise<Map<string, ResolvedPhoneContact>> {
    const resolvedMap = new Map<string, ResolvedPhoneContact>();

    if (!userIds || userIds.length === 0) {
      return resolvedMap;
    }

    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) {
      return resolvedMap;
    }

    // 1. Query via AuthCredential (type=PHONE)
    const credentials = await this.prisma.authCredential.findMany({
      where: {
        userId: { in: uniqueUserIds },
        type: AuthCredentialType.PHONE,
        deletedAt: null,
      },
      include: {
        identity: {
          select: {
            publicValueCiphertext: true,
            publicValueIv: true,
            publicValueTag: true,
            publicValueWrappedKey: true,
            publicValueKeyId: true,
          },
        },
        user: {
          select: {
            profile: {
              select: {
                firstName: true,
              },
            },
          },
        },
      },
    });

    for (const cred of credentials) {
      if (!cred.identity) continue;

      try {
        const rawPhone = await this.identityCryptoService.decryptPublicValue(
          cred.identity,
        );
        const formatted = this.formatPhone(rawPhone);
        if (formatted) {
          resolvedMap.set(cred.userId, {
            userId: cred.userId,
            phoneDigits: formatted.phoneDigits,
            e164Formatted: formatted.e164Formatted,
            firstName: cred.user?.profile?.firstName,
          });
        }
      } catch (err) {
        this.logger.warn('Failed to decrypt user phone from AuthCredential', {
          userId: cred.userId,
          step: 'decrypt_phone_credential',
          err: serializeError(err),
        });
      }
    }

    // 2. Fallback: Query Identity records for remaining users
    const remainingUserIds = uniqueUserIds.filter((id) => !resolvedMap.has(id));
    if (remainingUserIds.length > 0) {
      const identities = await this.prisma.identity.findMany({
        where: {
          userId: { in: remainingUserIds },
          type: IdentityType.PHONE,
          isVerified: true,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          userId: true,
          publicValueCiphertext: true,
          publicValueIv: true,
          publicValueTag: true,
          publicValueWrappedKey: true,
          publicValueKeyId: true,
          user: {
            select: {
              profile: {
                select: {
                  firstName: true,
                },
              },
            },
          },
        },
      });

      for (const identity of identities) {
        if (!identity.userId || resolvedMap.has(identity.userId)) continue;

        try {
          const rawPhone = await this.identityCryptoService.decryptPublicValue({
            publicValueCiphertext: identity.publicValueCiphertext,
            publicValueIv: identity.publicValueIv,
            publicValueTag: identity.publicValueTag,
            publicValueWrappedKey: identity.publicValueWrappedKey,
            publicValueKeyId: identity.publicValueKeyId,
          });
          const formatted = this.formatPhone(rawPhone);
          if (formatted) {
            resolvedMap.set(identity.userId, {
              userId: identity.userId,
              phoneDigits: formatted.phoneDigits,
              e164Formatted: formatted.e164Formatted,
              firstName: identity.user?.profile?.firstName,
            });
          }
        } catch (err) {
          this.logger.warn('Failed to decrypt user phone from Identity', {
            userId: identity.userId,
            step: 'decrypt_phone_identity',
            err: serializeError(err),
          });
        }
      }
    }

    return resolvedMap;
  }

  /**
   * Normalizes a raw phone string into ITU-T E.164 format and digits-only representation.
   *
   * @param rawPhone - Raw decrypted phone string (e.g. "+91 98765 43210" or "919876543210").
   * @returns Object with phoneDigits and e164Formatted, or null if invalid.
   */
  private formatPhone(
    rawPhone: string | null,
  ): { phoneDigits: string; e164Formatted: string } | null {
    if (!rawPhone || rawPhone.trim() === '') return null;

    const trimmed = rawPhone.trim();

    try {
      const candidate = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
      const parsed = parsePhoneNumberWithError(candidate);
      if (parsed.isValid()) {
        const phoneDigits = `${parsed.countryCallingCode}${parsed.nationalNumber}`;
        return {
          phoneDigits,
          e164Formatted: `+${phoneDigits}`,
        };
      }
    } catch {
      // libphonenumber-js parsing failed, fall back to pure digits sanitization
    }

    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length >= 7) {
      return {
        phoneDigits: digitsOnly,
        e164Formatted: `+${digitsOnly}`,
      };
    }

    return null;
  }
}
