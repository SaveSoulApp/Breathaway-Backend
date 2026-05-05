import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class EnumValidationPipe implements PipeTransform {
  constructor(
    private readonly enumType: any,
    private readonly enumName: string,
    private readonly optional: boolean = false,
    private readonly isArray: boolean = false,
  ) {}

  transform(value: any) {
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
