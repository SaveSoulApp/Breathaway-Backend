import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class RequiredStringPipe implements PipeTransform {
  constructor(private readonly paramName: string = 'parameter') {}

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

export function RequiredString(paramName: string = 'parameter') {
  return new RequiredStringPipe(paramName);
}
