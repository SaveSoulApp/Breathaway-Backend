import {
  PaymentGateway,
  TransactionChannel,
  TransactionEnvironment,
} from '@prisma/client';

import { RevenueCatWebhookRequestDto } from '../dto';
import { PurchaseEventType } from '../enums/purchase-event-type.enum';
import { RevenueCatEventType } from '../enums/revenuecat-event-type.enum';
import { parseRevenueCatWebhook } from '../utils/revenuecat-webhook.parser';

/**
 * Field values here mirror payloads captured from a real RevenueCat Test Store
 * purchase rather than the documentation, because the two disagree: the
 * dashboard's synthetic TEST event reports `store: "PLAY_STORE"` and null
 * transaction fields, which a live purchase does not.
 */
const USER_ID = '01JQ8ZC5X9T7VBN3KDME4RGWFA';

const buildPayload = (
  overrides: Partial<RevenueCatWebhookRequestDto['event']> = {},
): RevenueCatWebhookRequestDto => ({
  api_version: '1.0',
  event: {
    type: RevenueCatEventType.NON_RENEWING_PURCHASE,
    id: 'A18A73FC-D21F-453B-9869-DBA6CA8A6E9C',
    transaction_id: 'test_1788885960147_51a83d84',
    original_transaction_id: 'test_1788885960147_51a83d84',
    app_user_id: USER_ID,
    original_app_user_id: '$RCAnonymousID:856f59bbe65349a0a9448a4800ccb5ef',
    aliases: [USER_ID, '$RCAnonymousID:856f59bbe65349a0a9448a4800ccb5ef'],
    product_id: 'likes_10',
    environment: 'SANDBOX',
    store: 'TEST_STORE',
    price: 40.5,
    currency: 'USD',
    country_code: 'IN',
    purchased_at_ms: 1788885960828,
    event_timestamp_ms: 1788885960972,
    ...overrides,
  },
});

describe('parseRevenueCatWebhook', () => {
  it('normalises a consumable purchase into a purchase event', () => {
    const result = parseRevenueCatWebhook(buildPayload());

    expect(result.gateway).toBe(PaymentGateway.REVENUECAT);
    expect(result.type).toBe(PurchaseEventType.PURCHASE);
    expect(result.providerEventType).toBe(
      RevenueCatEventType.NON_RENEWING_PURCHASE,
    );
    expect(result.gatewayTransactionId).toBe('test_1788885960147_51a83d84');
    expect(result.gatewayEventId).toBe('A18A73FC-D21F-453B-9869-DBA6CA8A6E9C');
    expect(result.productId).toBe('likes_10');
    expect(result.environment).toBe(TransactionEnvironment.SANDBOX);
    expect(result.channel).toBeNull();
    expect(result.amount).toBe(40.5);
    expect(result.currency).toBe('USD');
    expect(result.countryCode).toBe('IN');
    expect(result.occurredAt).toEqual(new Date(1788885960828));
  });

  it('classifies the synthetic TEST event as unknown so it never grants', () => {
    const result = parseRevenueCatWebhook(
      buildPayload({
        type: RevenueCatEventType.TEST,
        product_id: 'test_product',
        transaction_id: null,
      }),
    );

    expect(result.type).toBe(PurchaseEventType.UNKNOWN);
  });

  it.each([
    RevenueCatEventType.INITIAL_PURCHASE,
    RevenueCatEventType.RENEWAL,
    RevenueCatEventType.EXPIRATION,
  ])('ignores the subscription lifecycle event %s', (type) => {
    expect(parseRevenueCatWebhook(buildPayload({ type })).type).toBe(
      PurchaseEventType.UNKNOWN,
    );
  });

  it.each([RevenueCatEventType.REFUND, RevenueCatEventType.CANCELLATION])(
    'classifies %s as a refund',
    (type) => {
      expect(parseRevenueCatWebhook(buildPayload({ type })).type).toBe(
        PurchaseEventType.REFUND,
      );
    },
  );

  it('puts app_user_id ahead of the aliases and drops duplicates', () => {
    const result = parseRevenueCatWebhook(buildPayload());

    expect(result.candidateUserIds).toEqual([
      '01JQ8ZC5X9T7VBN3KDME4RGWFA',
      '$RCAnonymousID:856f59bbe65349a0a9448a4800ccb5ef',
    ]);
  });

  it('keeps every alias regardless of the order RevenueCat sends them in', () => {
    // Two deliveries for the same customer have been observed with this array
    // reversed, so resolution must not depend on position.
    const result = parseRevenueCatWebhook(
      buildPayload({
        aliases: [
          '$RCAnonymousID:856f59bbe65349a0a9448a4800ccb5ef',
          '01JQ8ZC5X9T7VBN3KDME4RGWFA',
        ],
      }),
    );

    expect(result.candidateUserIds).toContain('01JQ8ZC5X9T7VBN3KDME4RGWFA');
    expect(result.candidateUserIds).toContain(
      '$RCAnonymousID:856f59bbe65349a0a9448a4800ccb5ef',
    );
  });

  it('does not treat original_app_user_id as a candidate on its own', () => {
    // It holds the pre-login anonymous ID, so leading with it would fail to
    // resolve every purchase made after sign-in.
    const result = parseRevenueCatWebhook(
      buildPayload({
        aliases: ['01JQ8ZC5X9T7VBN3KDME4RGWFA'],
        original_app_user_id: '$RCAnonymousID:not-in-aliases',
      }),
    );

    expect(result.candidateUserIds).not.toContain(
      '$RCAnonymousID:not-in-aliases',
    );
  });

  it('falls back to the event timestamp when no purchase time is reported', () => {
    const result = parseRevenueCatWebhook(
      buildPayload({ purchased_at_ms: null }),
    );

    expect(result.occurredAt).toEqual(new Date(1788885960972));
  });

  describe('malformed bodies', () => {
    // The route cannot run the strict validation pipe, so the parser is the only
    // place the payload's shape is checked. Anything unusable must classify as
    // UNKNOWN and be ignored — throwing would turn it into a retried delivery
    // for a payload that will never improve.
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'not-an-object'],
      ['an array', []],
      ['an empty object', {}],
      ['an object with no event', { api_version: '1.0' }],
      ['an event that is not an object', { event: 'nope' }],
    ])('classifies %s as unknown without throwing', (_label, body) => {
      const result = parseRevenueCatWebhook(body);

      expect(result.type).toBe(PurchaseEventType.UNKNOWN);
      expect(result.gatewayTransactionId).toBeNull();
      expect(result.productId).toBeNull();
      expect(result.candidateUserIds).toEqual([]);
    });

    it('ignores non-string entries in the aliases array', () => {
      const result = parseRevenueCatWebhook({
        event: { type: 'NON_RENEWING_PURCHASE', aliases: [1, null, USER_ID] },
      });

      expect(result.candidateUserIds).toEqual([USER_ID]);
    });

    it('ignores a non-numeric price', () => {
      const result = parseRevenueCatWebhook(
        buildPayload({ price: 'free' as unknown as number }),
      );

      expect(result.amount).toBeNull();
    });
  });

  it('treats a PRODUCTION environment as live', () => {
    const result = parseRevenueCatWebhook(
      buildPayload({ environment: 'PRODUCTION' }),
    );

    expect(result.environment).toBe(TransactionEnvironment.PRODUCTION);
  });

  it('defaults to sandbox when the environment is absent', () => {
    const result = parseRevenueCatWebhook(buildPayload({ environment: null }));

    expect(result.environment).toBe(TransactionEnvironment.SANDBOX);
  });

  describe('channel extraction from store', () => {
    it.each([
      ['APP_STORE', TransactionChannel.IOS],
      ['MAC_APP_STORE', TransactionChannel.IOS],
      ['app_store', TransactionChannel.IOS],
      ['PLAY_STORE', TransactionChannel.ANDROID],
      ['AMAZON', TransactionChannel.ANDROID],
      ['play_store', TransactionChannel.ANDROID],
      ['STRIPE', TransactionChannel.WEB],
      ['RC_BILLING', TransactionChannel.WEB],
      ['EXTERNAL', TransactionChannel.WEB],
      ['rc_billing', TransactionChannel.WEB],
    ])('maps store %s to channel %s', (store, expectedChannel) => {
      const result = parseRevenueCatWebhook(buildPayload({ store }));
      expect(result.channel).toBe(expectedChannel);
    });

    it.each([
      ['TEST_STORE', null],
      ['PROMOTIONAL', null],
      ['UNKNOWN_STORE', null],
      [null, null],
      [undefined, null],
    ])('maps unrecognised or sandbox store %s to null', (store, expected) => {
      const result = parseRevenueCatWebhook(buildPayload({ store }));
      expect(result.channel).toBe(expected);
    });
  });
});
