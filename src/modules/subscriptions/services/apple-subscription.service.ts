import { X509Certificate, timingSafeEqual, verify } from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionEventType } from '@prisma/client';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

import { InvalidAppleJwsException } from '../application/exceptions';
import {
  APPLE_JWS_ALGORITHM,
  APPLE_ROOT_CA_G3_PEM,
} from '../constants/apple-root-ca.constant';

export interface AppleTransactionInfo {
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  purchaseDate: number;
  expiresDate: number;
  currency?: string;
  price?: number;
  storefront?: string;
  bundleId?: string;
  environment?: string;
  webOrderLineItemId?: string;
  subscriptionGroupIdentifier?: string;
}

export interface AppleRenewalInfo {
  autoRenewProductId: string;
  autoRenewStatus: number;
  expirationIntent?: number;
  originalTransactionId?: string;
  recentSubscriptionStartDate?: number;
  signedDate?: number;
}

export interface AppleJwsHeader {
  alg: string;
  x5c: string[];
}

export interface AppleJwsPayload extends Record<string, unknown> {
  notificationType: string;
  subtype?: string;
  notificationUUID?: string;
  data?: {
    appAppleId?: number;
    bundleId?: string;
    bundleVersion?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    status?: number;
  };
  version?: string;
  signedDate?: number;
}

export interface AppleNotificationPayload {
  notificationType: string;
  subtype?: string;
  transactionInfo: AppleTransactionInfo;
  renewalInfo: AppleRenewalInfo;
  rawPayload: Record<string, unknown>;
}

/**
 * Integrates with Apple StoreKit 2 for Server-to-Server Notifications.
 *
 * Validates, decodes, and parses Apple's cryptographically signed JWS payloads,
 * enforcing x5c certificate chain validation anchored to the official Apple Root CA - G3
 * and ES256 cryptographic signature verification.
 */
@Injectable()
export class AppleSubscriptionService extends BaseService {
  private readonly trustedRootCert: X509Certificate;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
    const trustedRootPem =
      this.configService.get<string>('APPLE_ROOT_CA_PEM') ||
      APPLE_ROOT_CA_G3_PEM;
    this.trustedRootCert = new X509Certificate(trustedRootPem);
  }

  /**
   * Decodes and cryptographically verifies an Apple JWS webhook notification.
   *
   * Verifies the outer notification JWS and recursively verifies the embedded
   * signedTransactionInfo and signedRenewalInfo objects if present.
   *
   * @param signedPayload - The raw JWS string received from Apple.
   * @returns The cryptographically verified and parsed notification payload.
   * @throws {InvalidAppleJwsException} When JWS format, signature, or certificate chain is invalid.
   */
  parseNotification(signedPayload: string): AppleNotificationPayload {
    const outerPayload =
      this.verifyAndDecodeJws<AppleJwsPayload>(signedPayload);

    this.validateNotificationClaims(outerPayload);

    let transactionInfo = {} as AppleTransactionInfo;
    if (outerPayload.data?.signedTransactionInfo) {
      transactionInfo = this.verifyAndDecodeJws<AppleTransactionInfo>(
        outerPayload.data.signedTransactionInfo,
      );
      this.validateTransactionClaims(transactionInfo);
    }

    let renewalInfo = {} as AppleRenewalInfo;
    if (outerPayload.data?.signedRenewalInfo) {
      renewalInfo = this.verifyAndDecodeJws<AppleRenewalInfo>(
        outerPayload.data.signedRenewalInfo,
      );
    }

    return {
      notificationType: outerPayload.notificationType,
      subtype: outerPayload.subtype,
      transactionInfo,
      renewalInfo,
      rawPayload: outerPayload,
    };
  }

  /**
   * Cryptographically verifies and decodes an Apple StoreKit 2 transaction token (signedTransactionInfo).
   *
   * Validates ES256 signature, Apple Root CA certificate chain, bundle ID, and environment.
   *
   * @param jws - Compact JWS transaction token.
   * @returns Verified AppleTransactionInfo.
   * @throws {InvalidAppleJwsException} When JWS is invalid or verification fails.
   */
  verifyAndDecodeTransaction(jws: string): AppleTransactionInfo {
    const transactionInfo = this.verifyAndDecodeJws<AppleTransactionInfo>(jws);
    this.validateTransactionClaims(transactionInfo);
    return transactionInfo;
  }

  /**
   * Cryptographically verifies and decodes an Apple StoreKit 2 compact JWS token.
   *
   * 1. Validates JWS format (header.payload.signature).
   * 2. Decodes header and validates algorithm (ES256) and x5c certificate chain presence.
   * 3. Parses X.509 certificates and checks validity dates against current time.
   * 4. Validates certificate chain signatures:
   *    - Leaf certificate is signed by intermediate certificate.
   *    - Intermediate certificate is signed by Apple Root CA - G3.
   *    - Root certificate matches trusted Apple Root CA - G3 (fingerprint verification).
   * 5. Validates ES256 cryptographic signature using the leaf certificate's public key.
   * 6. Parses and returns the verified JSON payload.
   *
   * @param jws - Compact JWS string received from Apple.
   * @returns Cryptographically verified and decoded payload object.
   * @throws {InvalidAppleJwsException} When JWS format, signature, or certificate chain is invalid.
   */
  verifyAndDecodeJws<T = Record<string, unknown>>(jws: string): T {
    if (!jws || typeof jws !== 'string') {
      throw new InvalidAppleJwsException(
        'JWS token must be a non-empty string',
      );
    }

    const parts = jws.split('.');
    if (parts.length !== 3) {
      this.logger.warn(
        'Invalid JWS format: expected 3 parts separated by dots',
        { partsCount: parts.length, step: 'verify_jws' },
      );
      throw new InvalidAppleJwsException(
        `Invalid JWS format: expected 3 parts separated by dots, received ${parts.length}`,
      );
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // 1. Decode header
    let header: AppleJwsHeader;
    try {
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8');
      header = JSON.parse(headerJson) as AppleJwsHeader;
    } catch (error) {
      this.logger.error('Failed to parse JWS header JSON', {
        step: 'verify_jws_header',
        err: serializeError(error),
      });
      throw new InvalidAppleJwsException('Failed to parse JWS header');
    }

    // 2. Validate algorithm
    if (header.alg !== APPLE_JWS_ALGORITHM) {
      this.logger.warn('Unsupported JWS algorithm in Apple token', {
        alg: header.alg,
        expected: APPLE_JWS_ALGORITHM,
        step: 'verify_jws_alg',
      });
      throw new InvalidAppleJwsException(
        `Unsupported JWS algorithm: expected ${APPLE_JWS_ALGORITHM}, received ${header.alg}`,
      );
    }

    // 3. Validate x5c certificate chain
    if (!header.x5c || !Array.isArray(header.x5c) || header.x5c.length < 2) {
      this.logger.warn('Missing or insufficient x5c certificate chain in JWS', {
        x5cLength: header.x5c ? header.x5c.length : 0,
        step: 'verify_jws_x5c',
      });
      throw new InvalidAppleJwsException(
        'Invalid JWS header: x5c certificate chain must contain at least 2 certificates',
      );
    }

    let certs: X509Certificate[];
    try {
      certs = header.x5c.map(
        (derB64) => new X509Certificate(Buffer.from(derB64, 'base64')),
      );
    } catch (error) {
      this.logger.error('Failed to parse X.509 certificates from x5c chain', {
        step: 'parse_x5c_certificates',
        err: serializeError(error),
      });
      throw new InvalidAppleJwsException(
        'Failed to parse X.509 certificates from x5c chain',
      );
    }

    // 4. Check certificate validity dates
    const now = Date.now();
    for (const [index, cert] of certs.entries()) {
      const validFrom = new Date(cert.validFrom).getTime();
      const validTo = new Date(cert.validTo).getTime();
      if (now < validFrom || now > validTo) {
        this.logger.warn(
          'Certificate in x5c chain has expired or is not yet valid',
          {
            certIndex: index,
            validFrom: cert.validFrom,
            validTo: cert.validTo,
            step: 'verify_cert_dates',
          },
        );
        throw new InvalidAppleJwsException(
          `Certificate at index ${index} in x5c chain is expired or not yet valid`,
        );
      }
    }

    // 5. Verify certificate chain of trust
    const leafCert = certs[0];

    // Iteratively verify that each certificate is cryptographically signed by the next certificate in the chain
    for (let i = 0; i < certs.length - 1; i++) {
      if (!certs[i].verify(certs[i + 1].publicKey)) {
        this.logger.warn(
          'Certificate in x5c chain is not signed by next certificate in chain',
          { certIndex: i, step: 'verify_chain_signatures' },
        );
        throw new InvalidAppleJwsException(
          `Certificate at index ${i} in x5c chain is not cryptographically signed by certificate at index ${i + 1}`,
        );
      }
    }

    if (certs.length >= 3) {
      const rootCertInChain = certs[certs.length - 1];

      // Verify that the root certificate in x5c matches the trusted Apple Root CA using constant-time comparison
      const chainRootFp = rootCertInChain.fingerprint256.toUpperCase();
      const trustedRootFp = this.trustedRootCert.fingerprint256.toUpperCase();

      const chainRootFpBuf = Buffer.from(chainRootFp, 'utf8');
      const trustedRootFpBuf = Buffer.from(trustedRootFp, 'utf8');

      const isMatch =
        chainRootFpBuf.length === trustedRootFpBuf.length &&
        timingSafeEqual(chainRootFpBuf, trustedRootFpBuf);

      if (!isMatch) {
        this.logger.warn(
          'Root certificate in x5c chain does not match trusted Apple Root CA',
          {
            chainRootFp,
            trustedRootFp,
            step: 'verify_root_anchor',
          },
        );
        throw new InvalidAppleJwsException(
          `Root certificate fingerprint (${chainRootFp}) does not match trusted Apple Root CA (${trustedRootFp})`,
        );
      }
    } else {
      // Root was omitted from x5c; verify the top certificate directly against trusted Apple Root CA
      const intermediateCert = certs[certs.length - 1];
      if (!intermediateCert.verify(this.trustedRootCert.publicKey)) {
        this.logger.warn(
          'Intermediate certificate is not signed by trusted Apple Root CA',
          { step: 'verify_intermediate_against_root' },
        );
        throw new InvalidAppleJwsException(
          'Intermediate certificate is not cryptographically signed by trusted Apple Root CA',
        );
      }
    }

    // 6. Verify JWS cryptographic signature over `${headerB64}.${payloadB64}`
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(signatureB64, 'base64url');

    if (signature.length !== 64) {
      this.logger.warn('Invalid JWS signature length for ES256', {
        signatureLength: signature.length,
        step: 'verify_jws_signature',
      });
      throw new InvalidAppleJwsException(
        `Invalid JWS signature length: expected 64 bytes for ES256, received ${signature.length}`,
      );
    }

    const isValidSignature = verify(
      'sha256',
      Buffer.from(signingInput, 'utf8'),
      {
        key: leafCert.publicKey,
        dsaEncoding: 'ieee-p1363',
      },
      signature,
    );

    if (!isValidSignature) {
      this.logger.warn('JWS signature verification failed', {
        step: 'verify_jws_signature',
      });
      throw new InvalidAppleJwsException('JWS signature verification failed');
    }

    // 7. Parse verified payload
    try {
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
      return JSON.parse(payloadJson) as T;
    } catch (error) {
      this.logger.error('Failed to parse verified JWS payload JSON', {
        step: 'parse_jws_payload',
        err: serializeError(error),
      });
      throw new InvalidAppleJwsException('Failed to parse JWS payload JSON');
    }
  }

  /**
   * Maps an Apple notification type and subtype to a unified SubscriptionEventType.
   *
   * Used to standardize disparate store events into our internal billing lifecycle.
   *
   * @param notificationType - The primary event type from Apple (e.g., 'SUBSCRIBED').
   * @param subtype - Optional secondary context (e.g., 'INITIAL_BUY').
   * @returns The corresponding internal event type.
   */
  mapNotificationType(
    notificationType: string,
    subtype?: string,
  ): SubscriptionEventType {
    switch (notificationType) {
      case 'SUBSCRIBED':
        if (subtype === 'INITIAL_BUY') {
          return SubscriptionEventType.INITIAL_PURCHASE;
        }
        return SubscriptionEventType.RENEWAL;

      case 'DID_RENEW':
        return SubscriptionEventType.RENEWAL;

      case 'DID_CHANGE_RENEWAL_STATUS':
        if (subtype === 'AUTO_RENEW_DISABLED') {
          return SubscriptionEventType.CANCELLATION;
        }
        if (subtype === 'AUTO_RENEW_ENABLED') {
          return SubscriptionEventType.BILLING_RECOVERY;
        }
        return SubscriptionEventType.CANCELLATION;

      case 'GRACE_PERIOD_EXPIRED':
        return SubscriptionEventType.EXPIRY;

      case 'DID_FAIL_TO_RENEW':
        return SubscriptionEventType.GRACE_PERIOD_ENTERED;

      case 'REVOKE':
        return SubscriptionEventType.REVOCATION;

      case 'REFUND':
        return SubscriptionEventType.REFUND;

      case 'PRICE_INCREASE':
        if (subtype === 'ACCEPTED') {
          return SubscriptionEventType.PRICE_CHANGE_CONFIRMED;
        }
        return SubscriptionEventType.PRICE_CHANGE_CONFIRMED;

      case 'EXPIRED':
        return SubscriptionEventType.EXPIRY;

      default:
        this.logger.warn('Unmapped Apple notification type', {
          notificationType,
          subtype,
          step: 'map_notification',
        });
        return SubscriptionEventType.EXPIRY;
    }
  }

  // ──────────────────────────────────────────────
  // Private validation helpers
  // ──────────────────────────────────────────────

  private validateNotificationClaims(payload: AppleJwsPayload): void {
    if (
      !payload.notificationType ||
      typeof payload.notificationType !== 'string'
    ) {
      throw new InvalidAppleJwsException(
        'Missing or invalid notificationType in JWS payload',
      );
    }

    const expectedBundleId = this.configService.get<string>('APPLE_BUNDLE_ID');
    if (
      expectedBundleId &&
      payload.data?.bundleId &&
      payload.data.bundleId !== expectedBundleId
    ) {
      this.logger.warn('Mismatched Apple notification bundleId', {
        expected: expectedBundleId,
        received: payload.data.bundleId,
        step: 'validate_notification_claims',
      });
      throw new InvalidAppleJwsException(
        `Mismatched bundleId: expected ${expectedBundleId}, received ${payload.data.bundleId}`,
      );
    }

    if (payload.data?.environment) {
      const env = payload.data.environment;
      if (env !== 'Sandbox' && env !== 'Production') {
        throw new InvalidAppleJwsException(
          `Invalid environment in JWS payload: ${env}`,
        );
      }

      const isProduction =
        this.configService.get<string>('NODE_ENV') === 'production';
      if (isProduction && env === 'Sandbox') {
        this.logger.warn(
          'Received Apple Sandbox notification in production environment',
          { environment: env, step: 'validate_notification_environment' },
        );
        throw new InvalidAppleJwsException(
          'Sandbox notifications are not accepted in production environment',
        );
      }
    }
  }

  private validateTransactionClaims(tx: AppleTransactionInfo): void {
    const expectedBundleId = this.configService.get<string>('APPLE_BUNDLE_ID');
    if (expectedBundleId && tx.bundleId && tx.bundleId !== expectedBundleId) {
      this.logger.warn('Mismatched Apple transaction bundleId', {
        expected: expectedBundleId,
        received: tx.bundleId,
        step: 'validate_transaction_claims',
      });
      throw new InvalidAppleJwsException(
        `Mismatched transaction bundleId: expected ${expectedBundleId}, received ${tx.bundleId}`,
      );
    }

    if (tx.environment) {
      if (tx.environment !== 'Sandbox' && tx.environment !== 'Production') {
        throw new InvalidAppleJwsException(
          `Invalid environment in transaction payload: ${tx.environment}`,
        );
      }

      const isProduction =
        this.configService.get<string>('NODE_ENV') === 'production';
      if (isProduction && tx.environment === 'Sandbox') {
        this.logger.warn(
          'Received Apple Sandbox transaction in production environment',
          {
            environment: tx.environment,
            step: 'validate_transaction_environment',
          },
        );
        throw new InvalidAppleJwsException(
          'Sandbox transactions are not accepted in production environment',
        );
      }
    }
  }
}
