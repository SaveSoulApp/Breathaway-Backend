import { execSync } from 'child_process';
import { X509Certificate, sign } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionEventType } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { InvalidAppleJwsException } from '../application/exceptions';
import {
  APPLE_ROOT_CA_G3_FINGERPRINT_256,
  APPLE_ROOT_CA_G3_PEM,
} from '../constants/apple-root-ca.constant';
import { AppleSubscriptionService } from '../services/apple-subscription.service';

describe('AppleSubscriptionService', () => {
  let service: AppleSubscriptionService;
  let tmpDir: string;
  let trustedRootPem: string;
  let leafKey: string;
  let leafCertBase64: string;
  let interCertBase64: string;
  let rootCertBase64: string;
  let validChain: string[];

  let attackerLeafKey: string;
  let attackerChain: string[];

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'APPLE_ROOT_CA_PEM') return trustedRootPem;
      if (key === 'APPLE_BUNDLE_ID') return 'com.breathaway.app';
      return undefined;
    }),
  };

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apple-jws-test-'));

    // 1. Generate Trusted Root CA
    execSync(
      `openssl ecparam -name prime256v1 -genkey -noout -out ${tmpDir}/root.key`,
    );
    execSync(
      `openssl req -new -x509 -sha256 -key ${tmpDir}/root.key -out ${tmpDir}/root.crt -days 365 -subj '/CN=Apple Root CA - G3/O=Apple Inc./C=US'`,
    );

    // 2. Generate Intermediate CA signed by Root
    execSync(
      `openssl ecparam -name prime256v1 -genkey -noout -out ${tmpDir}/inter.key`,
    );
    execSync(
      `openssl req -new -sha256 -key ${tmpDir}/inter.key -out ${tmpDir}/inter.csr -subj '/CN=Apple Worldwide Developer Relations CA/O=Apple Inc./C=US'`,
    );
    execSync(
      `openssl x509 -req -in ${tmpDir}/inter.csr -CA ${tmpDir}/root.crt -CAkey ${tmpDir}/root.key -CAcreateserial -out ${tmpDir}/inter.crt -days 365 -sha256`,
    );

    // 3. Generate Leaf Cert signed by Intermediate
    execSync(
      `openssl ecparam -name prime256v1 -genkey -noout -out ${tmpDir}/leaf.key`,
    );
    execSync(
      `openssl req -new -sha256 -key ${tmpDir}/leaf.key -out ${tmpDir}/leaf.csr -subj '/CN=StoreKit Notification Signing/O=Apple Inc./C=US'`,
    );
    execSync(
      `openssl x509 -req -in ${tmpDir}/leaf.csr -CA ${tmpDir}/inter.crt -CAkey ${tmpDir}/inter.key -CAcreateserial -out ${tmpDir}/leaf.crt -days 365 -sha256`,
    );

    // 4. Generate Attacker / Untrusted Root & Leaf
    execSync(
      `openssl ecparam -name prime256v1 -genkey -noout -out ${tmpDir}/attacker_root.key`,
    );
    execSync(
      `openssl req -new -x509 -sha256 -key ${tmpDir}/attacker_root.key -out ${tmpDir}/attacker_root.crt -days 365 -subj '/CN=Fake Apple Root/O=Attacker/C=US'`,
    );
    execSync(
      `openssl ecparam -name prime256v1 -genkey -noout -out ${tmpDir}/attacker_leaf.key`,
    );
    execSync(
      `openssl req -new -sha256 -key ${tmpDir}/attacker_leaf.key -out ${tmpDir}/attacker_leaf.csr -subj '/CN=Fake StoreKit/O=Attacker/C=US'`,
    );
    execSync(
      `openssl x509 -req -in ${tmpDir}/attacker_leaf.csr -CA ${tmpDir}/attacker_root.crt -CAkey ${tmpDir}/attacker_root.key -CAcreateserial -out ${tmpDir}/attacker_leaf.crt -days 365 -sha256`,
    );

    trustedRootPem = fs.readFileSync(`${tmpDir}/root.crt`, 'utf8');
    const rootCert = new X509Certificate(trustedRootPem);
    const interCert = new X509Certificate(
      fs.readFileSync(`${tmpDir}/inter.crt`),
    );
    const leafCert = new X509Certificate(fs.readFileSync(`${tmpDir}/leaf.crt`));
    leafKey = fs.readFileSync(`${tmpDir}/leaf.key`, 'utf8');

    rootCertBase64 = rootCert.raw.toString('base64');
    interCertBase64 = interCert.raw.toString('base64');
    leafCertBase64 = leafCert.raw.toString('base64');
    validChain = [leafCertBase64, interCertBase64, rootCertBase64];

    const attackerRootCert = new X509Certificate(
      fs.readFileSync(`${tmpDir}/attacker_root.crt`),
    );
    const attackerLeafCert = new X509Certificate(
      fs.readFileSync(`${tmpDir}/attacker_leaf.crt`),
    );
    attackerLeafKey = fs.readFileSync(`${tmpDir}/attacker_leaf.key`, 'utf8');
    attackerChain = [
      attackerLeafCert.raw.toString('base64'),
      attackerRootCert.raw.toString('base64'),
    ];
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppleSubscriptionService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<AppleSubscriptionService>(AppleSubscriptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper to build a compact JWS with specified header, payload, signing key, and chain.
   */
  const buildJws = (
    payload: Record<string, unknown>,
    options?: {
      signingKey?: string;
      chain?: string[];
      alg?: string;
      tamperPayload?: boolean;
      tamperSignature?: boolean;
      invalidSignatureLength?: boolean;
    },
  ): string => {
    const key = options?.signingKey ?? leafKey;
    const chain = options?.chain ?? validChain;
    const alg = options?.alg ?? 'ES256';

    const header = { alg, x5c: chain };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signingInput = `${headerB64}.${payloadB64}`;

    const sig = sign('sha256', Buffer.from(signingInput, 'utf8'), {
      key,
      dsaEncoding: 'ieee-p1363',
    });

    let signatureB64: string;
    if (options?.invalidSignatureLength) {
      signatureB64 = Buffer.from('short-sig').toString('base64url');
    } else if (options?.tamperSignature) {
      const tampered = Buffer.from(sig);
      tampered[0] ^= 0xff;
      signatureB64 = tampered.toString('base64url');
    } else {
      signatureB64 = sig.toString('base64url');
    }

    const finalPayloadB64 = options?.tamperPayload
      ? Buffer.from(JSON.stringify({ ...payload, forged: true })).toString(
          'base64url',
        )
      : payloadB64;

    return `${headerB64}.${finalPayloadB64}.${signatureB64}`;
  };

  describe('Apple Root CA - G3 Constant Validation', () => {
    it('should have valid Apple Root CA - G3 PEM that matches official SHA-256 fingerprint', () => {
      const cert = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
      expect(cert.subject).toContain('Apple Root CA - G3');
      expect(cert.issuer).toContain('Apple Root CA - G3');
      expect(cert.fingerprint256.toUpperCase()).toBe(
        APPLE_ROOT_CA_G3_FINGERPRINT_256.toUpperCase(),
      );
      expect(cert.verify(cert.publicKey)).toBe(true);
    });
  });

  describe('verifyAndDecodeJws', () => {
    it('should successfully verify and decode a valid JWS', () => {
      const testPayload = {
        notificationType: 'SUBSCRIBED',
        subtype: 'INITIAL_BUY',
        data: {
          bundleId: 'com.breathaway.app',
          environment: 'Production',
        },
      };

      const jws = buildJws(testPayload);
      const decoded = service.verifyAndDecodeJws<typeof testPayload>(jws);

      expect(decoded).toEqual(testPayload);
    });

    it('should accept a 2-certificate chain when intermediate is signed by trusted root', () => {
      const twoCertChain = [leafCertBase64, interCertBase64];
      const payload = { test: 'two-cert-chain' };
      const jws = buildJws(payload, { chain: twoCertChain });

      const decoded = service.verifyAndDecodeJws<typeof payload>(jws);
      expect(decoded).toEqual(payload);
    });

    it('should throw InvalidAppleJwsException if JWS is not a string', () => {
      expect(() => service.verifyAndDecodeJws(null as any)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.verifyAndDecodeJws('')).toThrow(
        InvalidAppleJwsException,
      );
    });

    it('should throw InvalidAppleJwsException if JWS does not have exactly 3 parts', () => {
      expect(() => service.verifyAndDecodeJws('only.two')).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.verifyAndDecodeJws('one.two.three.four')).toThrow(
        InvalidAppleJwsException,
      );
    });

    it('should throw InvalidAppleJwsException if JWS header is invalid JSON', () => {
      const malformedHeader = 'not-json';
      const jws = `${Buffer.from(malformedHeader).toString('base64url')}.eyJ0ZXN0IjoxfQ.sig`;

      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        InvalidAppleJwsException,
      );
    });

    it('should throw InvalidAppleJwsException if algorithm is not ES256', () => {
      const jws = buildJws({ test: 1 }, { alg: 'RS256' });

      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        /Unsupported JWS algorithm/,
      );
    });

    it('should throw InvalidAppleJwsException if x5c is missing or empty', () => {
      const header = { alg: 'ES256', x5c: [] };
      const headerB64 = Buffer.from(JSON.stringify(header)).toString(
        'base64url',
      );
      const payloadB64 = Buffer.from(JSON.stringify({ test: 1 })).toString(
        'base64url',
      );
      const jws = `${headerB64}.${payloadB64}.fakesig`;

      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        /x5c certificate chain must contain at least 2 certificates/,
      );
    });

    it('should throw InvalidAppleJwsException if x5c contains malformed certificates', () => {
      const header = { alg: 'ES256', x5c: ['not-a-cert', 'also-not-a-cert'] };
      const headerB64 = Buffer.from(JSON.stringify(header)).toString(
        'base64url',
      );
      const payloadB64 = Buffer.from(JSON.stringify({ test: 1 })).toString(
        'base64url',
      );
      const jws = `${headerB64}.${payloadB64}.fakesig`;

      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        /Failed to parse X\.509 certificates/,
      );
    });

    it('should throw InvalidAppleJwsException if root certificate in chain does not match trusted root', () => {
      const jws = buildJws(
        { test: 'untrusted-root' },
        {
          signingKey: attackerLeafKey,
          chain: attackerChain,
        },
      );

      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        InvalidAppleJwsException,
      );
    });

    it('should throw InvalidAppleJwsException if signature length is not 64 bytes', () => {
      const jws = buildJws({ test: 1 }, { invalidSignatureLength: true });

      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        /Invalid JWS signature length/,
      );
    });

    it('should throw InvalidAppleJwsException if payload has been tampered with', () => {
      const jws = buildJws({ original: true }, { tamperPayload: true });

      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        /JWS signature verification failed/,
      );
    });

    it('should throw InvalidAppleJwsException if signature is forged / corrupted', () => {
      const jws = buildJws({ original: true }, { tamperSignature: true });

      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.verifyAndDecodeJws(jws)).toThrow(
        /JWS signature verification failed/,
      );
    });
  });

  describe('parseNotification', () => {
    it('should cryptographically verify outer and nested JWS payloads', () => {
      const transactionInfo = {
        originalTransactionId: 'orig-tx-123',
        transactionId: 'tx-123',
        productId: 'prod-premium',
        purchaseDate: 1719568800000,
        expiresDate: 1722160800000,
        currency: 'USD',
        price: 9990,
        storefront: 'USA',
        bundleId: 'com.breathaway.app',
      };

      const renewalInfo = {
        autoRenewProductId: 'prod-premium',
        autoRenewStatus: 1,
      };

      const signedTransactionInfo = buildJws(transactionInfo);
      const signedRenewalInfo = buildJws(renewalInfo);

      const outerPayload = {
        notificationType: 'SUBSCRIBED',
        subtype: 'INITIAL_BUY',
        data: {
          bundleId: 'com.breathaway.app',
          environment: 'Production',
          signedTransactionInfo,
          signedRenewalInfo,
        },
      };

      const signedPayload = buildJws(outerPayload);

      const result = service.parseNotification(signedPayload);

      expect(result.notificationType).toBe('SUBSCRIBED');
      expect(result.subtype).toBe('INITIAL_BUY');
      expect(result.transactionInfo).toEqual(transactionInfo);
      expect(result.renewalInfo).toEqual(renewalInfo);
      expect(result.rawPayload).toEqual(outerPayload);
    });

    it('should return empty objects for transactionInfo and renewalInfo if missing', () => {
      const outerPayload = {
        notificationType: 'EXPIRED',
        subtype: 'VOLUNTARY',
        data: {
          bundleId: 'com.breathaway.app',
          environment: 'Sandbox',
        },
      };

      const signedPayload = buildJws(outerPayload);

      const result = service.parseNotification(signedPayload);

      expect(result.notificationType).toBe('EXPIRED');
      expect(result.subtype).toBe('VOLUNTARY');
      expect(result.transactionInfo).toEqual({});
      expect(result.renewalInfo).toEqual({});
    });

    it('should throw InvalidAppleJwsException if notificationType is missing', () => {
      const outerPayload = {
        data: {
          bundleId: 'com.breathaway.app',
        },
      };

      const signedPayload = buildJws(outerPayload as any);

      expect(() => service.parseNotification(signedPayload)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.parseNotification(signedPayload)).toThrow(
        /Missing or invalid notificationType/,
      );
    });

    it('should throw InvalidAppleJwsException if outer bundleId does not match configured bundleId', () => {
      const outerPayload = {
        notificationType: 'SUBSCRIBED',
        data: {
          bundleId: 'com.fraudulent.app',
        },
      };

      const signedPayload = buildJws(outerPayload);

      expect(() => service.parseNotification(signedPayload)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.parseNotification(signedPayload)).toThrow(
        /Mismatched bundleId/,
      );
    });

    it('should throw InvalidAppleJwsException if transaction bundleId does not match configured bundleId', () => {
      const transactionInfo = {
        originalTransactionId: 'orig-tx-123',
        transactionId: 'tx-123',
        productId: 'prod-premium',
        purchaseDate: 1719568800000,
        expiresDate: 1722160800000,
        bundleId: 'com.fraudulent.app',
      };

      const outerPayload = {
        notificationType: 'SUBSCRIBED',
        data: {
          bundleId: 'com.breathaway.app',
          signedTransactionInfo: buildJws(transactionInfo),
        },
      };

      const signedPayload = buildJws(outerPayload);

      expect(() => service.parseNotification(signedPayload)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.parseNotification(signedPayload)).toThrow(
        /Mismatched transaction bundleId/,
      );
    });

    it('should throw InvalidAppleJwsException if environment is invalid', () => {
      const outerPayload = {
        notificationType: 'SUBSCRIBED',
        data: {
          bundleId: 'com.breathaway.app',
          environment: 'InvalidEnv',
        },
      };

      const signedPayload = buildJws(outerPayload);

      expect(() => service.parseNotification(signedPayload)).toThrow(
        InvalidAppleJwsException,
      );
      expect(() => service.parseNotification(signedPayload)).toThrow(
        /Invalid environment in JWS payload/,
      );
    });
  });

  describe('mapNotificationType', () => {
    const cases = [
      {
        type: 'SUBSCRIBED',
        subtype: 'INITIAL_BUY',
        expected: SubscriptionEventType.INITIAL_PURCHASE,
      },
      {
        type: 'SUBSCRIBED',
        subtype: 'AUTO_RENEW_ENABLED',
        expected: SubscriptionEventType.RENEWAL,
      },
      {
        type: 'SUBSCRIBED',
        subtype: undefined,
        expected: SubscriptionEventType.RENEWAL,
      },
      {
        type: 'DID_RENEW',
        subtype: undefined,
        expected: SubscriptionEventType.RENEWAL,
      },
      {
        type: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'AUTO_RENEW_DISABLED',
        expected: SubscriptionEventType.CANCELLATION,
      },
      {
        type: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'AUTO_RENEW_ENABLED',
        expected: SubscriptionEventType.BILLING_RECOVERY,
      },
      {
        type: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'UNKNOWN',
        expected: SubscriptionEventType.CANCELLATION,
      },
      {
        type: 'GRACE_PERIOD_EXPIRED',
        subtype: undefined,
        expected: SubscriptionEventType.EXPIRY,
      },
      {
        type: 'DID_FAIL_TO_RENEW',
        subtype: undefined,
        expected: SubscriptionEventType.GRACE_PERIOD_ENTERED,
      },
      {
        type: 'REVOKE',
        subtype: undefined,
        expected: SubscriptionEventType.REVOCATION,
      },
      {
        type: 'REFUND',
        subtype: undefined,
        expected: SubscriptionEventType.REFUND,
      },
      {
        type: 'PRICE_INCREASE',
        subtype: 'ACCEPTED',
        expected: SubscriptionEventType.PRICE_CHANGE_CONFIRMED,
      },
      {
        type: 'PRICE_INCREASE',
        subtype: undefined,
        expected: SubscriptionEventType.PRICE_CHANGE_CONFIRMED,
      },
      {
        type: 'EXPIRED',
        subtype: undefined,
        expected: SubscriptionEventType.EXPIRY,
      },
      {
        type: 'UNKNOWN_TYPE',
        subtype: undefined,
        expected: SubscriptionEventType.EXPIRY,
      },
    ];

    cases.forEach(({ type, subtype, expected }) => {
      it(`should map notificationType="${type}" and subtype="${subtype}" to eventType="${expected}"`, () => {
        const result = service.mapNotificationType(type, subtype);
        expect(result).toBe(expected);
      });
    });
  });
});
