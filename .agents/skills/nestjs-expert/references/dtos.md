# DTO Reference

## Naming Convention

| File                                          | Class name                 |
| --------------------------------------------- | -------------------------- |
| `dto/request/create-user.request.dto.ts`      | `CreateUserRequestDto`     |
| `dto/request/update-user.request.dto.ts`      | `UpdateUserRequestDto`     |
| `dto/response/user.response.dto.ts`           | `UserResponseDto`          |
| `dto/response/paginated-user.response.dto.ts` | `PaginatedUserResponseDto` |

Pattern: `<Verb><Entity>RequestDto` for inputs, `<Entity>ResponseDto` for outputs. Never mix them.

## Request DTOs

Every incoming payload field needs three things: `class-validator` decorator, `@ApiProperty`, and a TypeScript type.

Use `@IsOptional()` + `?` for optional fields. Use `PartialType` for update DTOs to avoid duplicating decorators.

```typescript
// dto/request/create-user.request.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'strongPass123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
```

```typescript
// dto/request/update-user.request.dto.ts
import { PartialType } from '@nestjs/swagger';

import { CreateUserRequestDto } from './create-user.request.dto';

// Inherits all validators and Swagger docs; makes every field optional
export class UpdateUserRequestDto extends PartialType(CreateUserRequestDto) {}
```

## Response DTOs

Response DTOs are plain classes — no validation decorators needed. Only expose what the client should see. Internal fields (`passwordHash`, `deletedAt`, Prisma relation objects) must be omitted.

```typescript
// dto/response/user.response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: 'clx1234abcd' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: '2024-01-15T10:00:00.000Z' })
  createdAt: Date;
}
```

## Paginated Response DTOs

For list endpoints, wrap with a pagination envelope:

```typescript
// dto/response/paginated-user.response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

import { UserResponseDto } from './user.response.dto';

export class PaginatedUserResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  data: UserResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;
}
```

## Barrel File

Every `dto/` folder must have an `index.ts` that re-exports everything. This is the only import path consumers should use.

```typescript
// dto/index.ts
export * from './request/create-user.request.dto';
export * from './request/update-user.request.dto';
export * from './response/paginated-user.response.dto';
export * from './response/user.response.dto';
```

Controllers and services import from the barrel:

```typescript
import { CreateUserRequestDto, UserResponseDto } from './dto';
```

## Common Validation Decorators

```typescript
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

// String
@IsString()
name: string;

// Email
@IsEmail()
email: string;

// UUID (e.g., route param passed as body field)
@IsUUID('4')
userId: string;

// Enum
enum Role { ADMIN = 'ADMIN', USER = 'USER' }
@IsEnum(Role)
role: Role;

// Number with range
@IsInt()
@Min(1)
@Max(100)
limit: number;

// Optional field
@IsOptional()
@IsString()
bio?: string;

// Array of strings
@IsArray()
@IsString({ each: true })
tags: string[];

// ISO date string
@IsDateString()
scheduledAt: string;
```
