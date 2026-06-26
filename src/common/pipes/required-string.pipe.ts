import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Validates and coerces a request parameter to ensure it is a non-empty string.
 *
 * Use this to enforce strict presence and type constraints on route parameters, query strings,
 * or body fields before they reach the controller layer. Rejects undefined, null, non-string,
 * or empty whitespace values.
 */
@Injectable()
export class RequiredStringPipe implements PipeTransform {
  /**
   * Initializes the pipe with a custom parameter name for clearer error messages.
   *
   * @param paramName - The name of the parameter being validated, included in the exception message.
   */
  constructor(private readonly paramName: string = 'parameter') {}

  /**
   * Parses the raw value and rejects invalid or empty input.
   *
   * @param value - Raw value from the incoming request parameter.
   * @returns The trimmed string if valid.
   * @throws {BadRequestException} When the value is missing, not a string, or contains only whitespace.
   */
  transform(value: unknown) {
    if (value === undefined || value === null) {
      throw new BadRequestException(`${this.paramName} is required`);
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${this.paramName} must be a string`);
    }

    const trimmedValue = value.trim();
    if (trimmedValue === '') {
      throw new BadRequestException(`${this.paramName} cannot be empty`);
    }

    return trimmedValue;
  }
}

/**
 * Convenience factory to create a RequiredStringPipe with a specific parameter name.
 * 
 * @param paramName - The name of the parameter being validated.
 * @returns A new instance of RequiredStringPipe.
 */
export function RequiredString(paramName: string = 'parameter') {
  return new RequiredStringPipe(paramName);
}
