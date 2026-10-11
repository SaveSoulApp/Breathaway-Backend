import { BadRequestException } from '@nestjs/common';
import { IsNumber, IsString } from 'class-validator';

import { AllowNonWhitelisted } from '@common/decorators/allow-non-whitelisted.decorator';
import { CashfreeWebhookRequestDto } from '@modules/webhooks/dto/request/cashfree-payment-webhook.request.dto';
import { RevenueCatWebhookRequestDto } from '@modules/webhooks/dto/request/revenuecat-webhook.request.dto';

import { AppValidationPipe } from '../app-validation.pipe';

class StrictTestDto {
  @IsString()
  name: string;

  @IsNumber()
  age: number;
}

@AllowNonWhitelisted()
class RelaxedTestDto {
  @IsString()
  id: string;

  @IsNumber()
  amount: number;
}

describe('AppValidationPipe', () => {
  let pipe: AppValidationPipe;

  beforeEach(() => {
    // Arrange
    pipe = new AppValidationPipe();
  });

  describe('strict DTO validation (default behavior)', () => {
    it('should successfully validate and return whitelisted properties', async () => {
      // Arrange
      const payload = { name: 'Valid Name', age: 25 };

      // Act
      const result = await pipe.transform(payload, {
        type: 'body',
        metatype: StrictTestDto,
      });

      // Assert
      expect(result).toEqual({ name: 'Valid Name', age: 25 });
    });

    it('should throw BadRequestException when non-whitelisted property is provided', async () => {
      // Arrange
      const payload = {
        name: 'Valid Name',
        age: 25,
        extraProperty: 'malicious',
      };

      // Act & Assert
      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: StrictTestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when required property validation fails', async () => {
      // Arrange — 'not-a-number' converts to NaN which fails @IsNumber()
      const payload = { name: 'Valid Name', age: 'not-a-number' };

      // Act & Assert
      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: StrictTestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('@AllowNonWhitelisted() DTO validation (relaxed behavior)', () => {
    it('should allow undeclared properties without throwing BadRequestException', async () => {
      // Arrange
      const payload = {
        id: 'evt-123',
        amount: 99,
        discount_percentage: 10,
        future_nested_field: { key: 'value' },
      };

      // Act
      const result = await pipe.transform(payload, {
        type: 'body',
        metatype: RelaxedTestDto,
      });

      // Assert
      expect(result).toMatchObject({
        id: 'evt-123',
        amount: 99,
        discount_percentage: 10,
        future_nested_field: { key: 'value' },
      });
    });

    it('should still enforce validation rules on declared properties', async () => {
      // Arrange — amount must be a number
      const payload = {
        id: 'evt-123',
        amount: 'not-a-number',
        extra_prop: 'allowed',
      };

      // Act & Assert
      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: RelaxedTestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept RevenueCatWebhookRequestDto carrying undeclared properties without failing validation', async () => {
      // Arrange
      const payload = {
        api_version: '1.0',
        event: {
          type: 'NON_RENEWING_PURCHASE',
          id: 'evt_1',
          transaction_id: 'txn_1',
          product_id: 'likes_10',
          discount_percentage: null,
          discount_amount: null,
          discount_identifier: null,
          some_future_field: { nested: true },
        },
      };

      // Act
      const result = await pipe.transform(payload, {
        type: 'body',
        metatype: RevenueCatWebhookRequestDto,
      });

      // Assert
      expect(result).toBeDefined();
      expect(result).toMatchObject({
        api_version: '1.0',
        event: expect.objectContaining({
          type: 'NON_RENEWING_PURCHASE',
          id: 'evt_1',
          transaction_id: 'txn_1',
          product_id: 'likes_10',
          some_future_field: { nested: true },
        }),
      });
    });

    it('should accept CashfreeWebhookRequestDto carrying PG v2 payload and extra fields', async () => {
      // Arrange
      const payload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        event_time: '2026-10-09T18:51:27+05:30',
        data: {
          order: {
            order_id: 'order_123',
            order_amount: 399.0,
            order_currency: 'INR',
            order_tags: null,
          },
          payment: {
            cf_payment_id: 1453002795,
            payment_status: 'SUCCESS',
            payment_amount: 399.0,
            payment_currency: 'INR',
            bank_reference: '234928698581',
          },
          customer_details: {
            customer_email: 'test@example.com',
          },
          payment_gateway_details: {
            gateway_name: 'CASHFREE',
          },
        },
      };

      // Act
      const result = (await pipe.transform(payload, {
        type: 'body',
        metatype: CashfreeWebhookRequestDto,
      })) as CashfreeWebhookRequestDto;

      // Assert
      expect(result).toBeDefined();
      expect(result.type).toBe('PAYMENT_SUCCESS_WEBHOOK');
      expect(result.data?.order?.order_id).toBe('order_123');
      expect(result.data?.payment?.cf_payment_id).toBe('1453002795');
      expect(result.data?.payment?.payment_status).toBe('SUCCESS');
    });

    it('should accept CashfreeWebhookRequestDto carrying a test ping payload without error', async () => {
      // Arrange
      const payload = {
        type: 'TEST_WEBHOOK',
        event_time: '2026-10-09T18:51:27+05:30',
        data: {},
      };

      // Act
      const result = (await pipe.transform(payload, {
        type: 'body',
        metatype: CashfreeWebhookRequestDto,
      })) as CashfreeWebhookRequestDto;

      // Assert
      expect(result).toBeDefined();
      expect(result.type).toBe('TEST_WEBHOOK');
    });
  });
});
