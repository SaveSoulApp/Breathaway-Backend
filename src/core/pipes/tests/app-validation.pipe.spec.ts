import { BadRequestException } from '@nestjs/common';
import { IsNumber, IsString } from 'class-validator';

import { AllowNonWhitelisted } from '@common/decorators/allow-non-whitelisted.decorator';

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
  });
});
