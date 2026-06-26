import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Validates that incoming query or route parameters strictly match a predefined TypeScript enum.
 *
 * Prevents invalid enum values from reaching controllers, avoiding database or logic errors.
 * Supports array values for multi-select query parameters.
 */
@Injectable()
export class EnumValidationPipe implements PipeTransform {
  constructor(
    private readonly enumType: Record<string, unknown>,
    private readonly enumName: string,
    private readonly optional: boolean = false,
    private readonly isArray: boolean = false,
  ) {}

  /**
   * Validates the raw input value against the allowed values of the specified enum.
   *
   * Automatically handles optional fields, arrays, and single-value coercion when needed.
   *
   * @param value - Raw string or array of strings from the incoming request.
   * @returns The original or coerced value if it strictly matches the enum.
   * @throws {BadRequestException} When any provided value does not exist in the target enum.
   */
  transform(value: unknown): unknown {
    if (
      this.optional &&
      (value === undefined || value === null || value === '')
    ) {
      return value;
    }

    const enumValues = Object.values(this.enumType);

    // Handle array values (e.g., ?status=overdue&status=pending)
    if (Array.isArray(value)) {
      const invalid = value.filter((v) => !enumValues.includes(v));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Invalid ${this.enumName}: [${invalid.join(
            ', ',
          )}]. Must be one of: ${enumValues.join(', ')}`,
        );
      }
      return value;
    }

    // Handle single value - convert to array if isArray flag is true
    if (this.isArray && value) {
      if (!enumValues.includes(value)) {
        throw new BadRequestException(
          `Invalid ${this.enumName}. Must be one of: ${enumValues.join(', ')}`,
        );
      }
      return [value];
    }

    // Handle single value without array conversion
    if (!enumValues.includes(value)) {
      throw new BadRequestException(
        `Invalid ${this.enumName}. Must be one of: ${enumValues.join(', ')}`,
      );
    }

    return value;
  }
}
