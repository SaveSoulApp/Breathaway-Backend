import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { TimezoneUtil } from '../utils/timezone.utils';

export function IsValidTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidTimezone',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          // Allow optional (undefined/null/empty)
          if (value === undefined || value === null || value === '') {
            return true;
          }

          // Must be a string
          if (typeof value !== 'string') {
            return false;
          }

          // Check if it's a valid IANA timezone
          return TimezoneUtil.isValidTimezone(value);
        },
        defaultMessage(args: ValidationArguments): string {
          const value = args.value as unknown;

          if (value === undefined || value === null || value === '') {
            return 'Timezone should not be empty';
          }

          if (typeof value !== 'string') {
            return 'Timezone must be a string';
          }

          const tz = value.trim();
          const normalized = TimezoneUtil.normalizeTimezone(tz);

          if (normalized !== 'UTC') {
            return `"${tz}" is not a valid IANA timezone. Did you mean "${normalized}"?`;
          }

          return `"${tz}" is not a valid IANA timezone. Examples: "Asia/Kolkata", "America/New_York", "Europe/London"`;
        },
      },
    });
  };
}
