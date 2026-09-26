import { Prisma } from '@prisma/client';
import { Expose } from 'class-transformer';
import { lastValueFrom, Observable } from 'rxjs';

import { BaseAuditExcludeDto } from '@common/dto';
import { SubscriptionPlanResponseDto } from '@modules/subscriptions/dto';

import {
  SerializeExpose,
  SerializeExposerInterceptor,
} from '../../interceptors/serialize-expose.interceptor';
import {
  createMockCallHandler,
  createMockExecutionContext,
} from '../mocks/execution-context.mock';

class TestDto {
  @Expose()
  publicProp: string;

  hiddenProp: string;
}

class DecimalTestDto {
  @Expose()
  id: string;

  @Expose()
  amount: number;
}

describe(SerializeExposerInterceptor.name, () => {
  let interceptor: SerializeExposerInterceptor;

  beforeEach(() => {
    interceptor = new SerializeExposerInterceptor(TestDto);
  });

  it('should transform data and expose ONLY marked properties', async () => {
    const context = createMockExecutionContext();
    const callHandler = createMockCallHandler({
      publicProp: 'public',
      hiddenProp: 'hidden',
    });

    const resultObservable = interceptor.intercept(
      context,
      callHandler,
    ) as Observable<TestDto>;
    const result = await lastValueFrom(resultObservable);

    expect(result).toBeInstanceOf(TestDto);
    expect(result.publicProp).toBe('public');
    expect(result.hiddenProp).toBeUndefined(); // Extraneous values excluded
  });

  it('should convert Prisma.Decimal values into numbers without throwing DecimalError', async () => {
    const decimalInterceptor = new SerializeExposerInterceptor(DecimalTestDto);
    const context = createMockExecutionContext();
    const callHandler = createMockCallHandler({
      id: 'item_1',
      amount: new Prisma.Decimal('49.99'),
    });

    const resultObservable = decimalInterceptor.intercept(
      context,
      callHandler,
    ) as Observable<DecimalTestDto>;
    const result = await lastValueFrom(resultObservable);

    expect(result).toBeInstanceOf(DecimalTestDto);
    expect(result.id).toBe('item_1');
    expect(result.amount).toBe(49.99);
    expect(typeof result.amount).toBe('number');
  });

  it('should successfully serialize plans with nested prices containing Prisma.Decimal', async () => {
    const plansInterceptor = new SerializeExposerInterceptor(
      SubscriptionPlanResponseDto,
    );
    const context = createMockExecutionContext();
    const mockPlansData = [
      {
        id: 'plan_123',
        name: 'Premium Monthly',
        slug: 'premium-monthly',
        description: 'Access to all features',
        appleProductId: 'com.breathaway.monthly',
        googleProductId: 'com.breathaway.monthly',
        creditsGranted: 100,
        validityDays: 30,
        trialDurationDays: 7,
        sortOrder: 1,
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        prices: [
          {
            id: 'price_in',
            currencyCode: 'INR',
            price: new Prisma.Decimal('799.00'),
            countryCode: 'IN',
          },
        ],
      },
    ];

    const callHandler = createMockCallHandler(mockPlansData);
    const resultObservable = plansInterceptor.intercept(
      context,
      callHandler,
    ) as Observable<SubscriptionPlanResponseDto[]>;
    const result = await lastValueFrom(resultObservable);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(SubscriptionPlanResponseDto);
    expect(result[0].name).toBe('Premium Monthly');
    expect(result[0].prices).toHaveLength(1);
    expect(result[0].prices[0].price).toBe(799);
    expect(typeof result[0].prices[0].price).toBe('number');
    expect(result[0].prices[0].currencyCode).toBe('INR');
    expect(result[0].prices[0].countryCode).toBe('IN');
    // Ensure internal DB audit timestamps are excluded from the serialized DTO
    expect(
      (result[0] as unknown as { createdAt?: unknown }).createdAt,
    ).toBeUndefined();
    expect(
      (result[0] as unknown as { updatedAt?: unknown }).updatedAt,
    ).toBeUndefined();
  });

  it('should strip createdAt, updatedAt, and deletedAt when DTO extends BaseAuditExcludeDto', async () => {
    class EntityWithAuditDto extends BaseAuditExcludeDto {
      @Expose()
      id: string;

      @Expose()
      name: string;
    }

    const auditInterceptor = new SerializeExposerInterceptor(
      EntityWithAuditDto,
    );
    const context = createMockExecutionContext();
    const callHandler = createMockCallHandler({
      id: 'user_123',
      name: 'Alice',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      secretHash: 'should-not-leak',
    });

    const resultObservable = auditInterceptor.intercept(
      context,
      callHandler,
    ) as Observable<EntityWithAuditDto>;
    const result = await lastValueFrom(resultObservable);

    expect(result).toBeInstanceOf(EntityWithAuditDto);
    expect(result.id).toBe('user_123');
    expect(result.name).toBe('Alice');
    expect(
      (result as unknown as { createdAt?: unknown }).createdAt,
    ).toBeUndefined();
    expect(
      (result as unknown as { updatedAt?: unknown }).updatedAt,
    ).toBeUndefined();
    expect(
      (result as unknown as { deletedAt?: unknown }).deletedAt,
    ).toBeUndefined();
    expect(
      (result as unknown as { secretHash?: unknown }).secretHash,
    ).toBeUndefined();
  });
});

describe('SerializeExpose Decorator', () => {
  it('should be defined', () => {
    expect(SerializeExpose(TestDto)).toBeDefined();
  });
});
