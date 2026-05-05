import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';

export const RequiredStringQuery = createParamDecorator(
  (paramName: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const value = request.query[paramName];

    if (value === undefined || value === null) {
      throw new BadRequestException(`${paramName} is required`);
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${paramName} must be a string`);
    }

    const trimmedValue = value.trim();
    if (trimmedValue === '') {
      throw new BadRequestException(`${paramName} cannot be empty`);
    }

    return trimmedValue;
  },
);
