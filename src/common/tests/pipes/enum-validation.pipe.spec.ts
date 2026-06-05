import { BadRequestException } from '@nestjs/common';
import { EnumValidationPipe } from '../../pipes/enum-validation.pipe';

// Test enum
enum TestStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
}

describe(EnumValidationPipe.name, () => {
  describe('basic validation (non-optional, non-array)', () => {
    let pipe: EnumValidationPipe;

    beforeEach(() => {
      pipe = new EnumValidationPipe(TestStatus, 'status');
    });

    it('should be defined', () => {
      expect(pipe).toBeDefined();
    });

    it('should accept valid enum value', () => {
      const result = pipe.transform(TestStatus.ACTIVE);
      expect(result).toBe(TestStatus.ACTIVE);
    });

    it('should accept all valid enum values', () => {
      expect(pipe.transform(TestStatus.ACTIVE)).toBe(TestStatus.ACTIVE);
      expect(pipe.transform(TestStatus.INACTIVE)).toBe(TestStatus.INACTIVE);
      expect(pipe.transform(TestStatus.PENDING)).toBe(TestStatus.PENDING);
    });

    it('should throw BadRequestException for invalid enum value', () => {
      expect(() => {
        pipe.transform('invalid');
      }).toThrow(
        new BadRequestException(
          'Invalid status. Must be one of: active, inactive, pending',
        ),
      );
    });

    it('should throw BadRequestException for undefined', () => {
      expect(() => {
        pipe.transform(undefined);
      }).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for null', () => {
      expect(() => {
        pipe.transform(null);
      }).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for empty string', () => {
      expect(() => {
        pipe.transform('');
      }).toThrow(BadRequestException);
    });
  });

  describe('optional validation', () => {
    let pipe: EnumValidationPipe;

    beforeEach(() => {
      pipe = new EnumValidationPipe(TestStatus, 'status', true);
    });

    it('should accept undefined when optional', () => {
      const result = pipe.transform(undefined);
      expect(result).toBeUndefined();
    });

    it('should accept null when optional', () => {
      const result = pipe.transform(null);
      expect(result).toBeNull();
    });

    it('should accept empty string when optional', () => {
      const result = pipe.transform('');
      expect(result).toBe('');
    });

    it('should still validate non-empty values', () => {
      expect(pipe.transform(TestStatus.ACTIVE)).toBe(TestStatus.ACTIVE);
    });

    it('should still throw for invalid non-empty values', () => {
      expect(() => {
        pipe.transform('invalid');
      }).toThrow(
        new BadRequestException(
          'Invalid status. Must be one of: active, inactive, pending',
        ),
      );
    });
  });

  describe('array validation', () => {
    let pipe: EnumValidationPipe;

    beforeEach(() => {
      pipe = new EnumValidationPipe(TestStatus, 'status');
    });

    it('should accept array of valid enum values', () => {
      const input = [TestStatus.ACTIVE, TestStatus.PENDING];
      const result = pipe.transform(input);
      expect(result).toEqual(input);
    });

    it('should accept single-item array', () => {
      const input = [TestStatus.ACTIVE];
      const result = pipe.transform(input);
      expect(result).toEqual(input);
    });

    it('should throw BadRequestException for array with invalid values', () => {
      const input = ['invalid1', 'invalid2'];
      expect(() => {
        pipe.transform(input);
      }).toThrow(
        new BadRequestException(
          'Invalid status: [invalid1, invalid2]. Must be one of: active, inactive, pending',
        ),
      );
    });

    it('should throw BadRequestException for mixed valid and invalid values', () => {
      const input = [TestStatus.ACTIVE, 'invalid', TestStatus.PENDING];
      expect(() => {
        pipe.transform(input);
      }).toThrow(
        new BadRequestException(
          'Invalid status: [invalid]. Must be one of: active, inactive, pending',
        ),
      );
    });

    it('should list all invalid values in error message', () => {
      const input = [
        TestStatus.ACTIVE,
        'invalid1',
        'invalid2',
        TestStatus.PENDING,
      ];
      expect(() => {
        pipe.transform(input);
      }).toThrow(
        new BadRequestException(
          'Invalid status: [invalid1, invalid2]. Must be one of: active, inactive, pending',
        ),
      );
    });
  });

  describe('array conversion (isArray flag)', () => {
    let pipe: EnumValidationPipe;

    beforeEach(() => {
      pipe = new EnumValidationPipe(TestStatus, 'status', false, true);
    });

    it('should convert single valid value to array', () => {
      const result = pipe.transform(TestStatus.ACTIVE);
      expect(result).toEqual([TestStatus.ACTIVE]);
    });

    it('should throw BadRequestException for single invalid value', () => {
      expect(() => {
        pipe.transform('invalid');
      }).toThrow(
        new BadRequestException(
          'Invalid status. Must be one of: active, inactive, pending',
        ),
      );
    });

    it('should keep array as array', () => {
      const input = [TestStatus.ACTIVE, TestStatus.PENDING];
      const result = pipe.transform(input);
      expect(result).toEqual(input);
    });

    it('should throw for array with invalid values', () => {
      const input = [TestStatus.ACTIVE, 'invalid'];
      expect(() => {
        pipe.transform(input);
      }).toThrow(
        new BadRequestException(
          'Invalid status: [invalid]. Must be one of: active, inactive, pending',
        ),
      );
    });
  });

  describe('optional with isArray flag', () => {
    let pipe: EnumValidationPipe;

    beforeEach(() => {
      pipe = new EnumValidationPipe(TestStatus, 'status', true, true);
    });

    it('should accept undefined when optional', () => {
      const result = pipe.transform(undefined);
      expect(result).toBeUndefined();
    });

    it('should accept null when optional', () => {
      const result = pipe.transform(null);
      expect(result).toBeNull();
    });

    it('should convert valid single value to array', () => {
      const result = pipe.transform(TestStatus.ACTIVE);
      expect(result).toEqual([TestStatus.ACTIVE]);
    });
  });

  describe('with different enum types', () => {
    enum Priority {
      LOW = 'low',
      MEDIUM = 'medium',
      HIGH = 'high',
      CRITICAL = 'critical',
    }

    it('should work with different enum', () => {
      const pipe = new EnumValidationPipe(Priority, 'priority');
      expect(pipe.transform(Priority.HIGH)).toBe(Priority.HIGH);
      expect(() => {
        pipe.transform('invalid');
      }).toThrow(
        new BadRequestException(
          'Invalid priority. Must be one of: low, medium, high, critical',
        ),
      );
    });

    it('should work with numeric enums', () => {
      enum NumericEnum {
        FIRST = 1,
        SECOND = 2,
        THIRD = 3,
      }

      const pipe = new EnumValidationPipe(NumericEnum, 'number');
      expect(pipe.transform(1)).toBe(1);
      expect(pipe.transform(2)).toBe(2);
      expect(() => {
        pipe.transform(99);
      }).toThrow(BadRequestException);
    });
  });
});
