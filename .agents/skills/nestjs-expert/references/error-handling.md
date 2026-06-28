# Error Handling Reference

## The Rule

Services throw NestJS HTTP exceptions. The global `HttpExceptionFilter` handles formatting. Never return raw error objects or catch-and-swallow exceptions silently.

## Prisma Error Code Map

Prisma throws `PrismaClientKnownRequestError` with a `code` field. Map these to HTTP exceptions in the service — don't let Prisma errors bubble up to the client.

| Prisma code | Meaning | Throw |
|---|---|---|
| `P2002` | Unique constraint violation | `ConflictException` |
| `P2025` | Record not found (update/delete) | `NotFoundException` |
| `P2003` | Foreign key constraint failed | `BadRequestException` |
| `P2014` | Relation violation | `BadRequestException` |

```typescript
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

function handlePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        throw new ConflictException('A record with this value already exists');
      case 'P2025':
        throw new NotFoundException('Record not found');
      case 'P2003':
      case 'P2014':
        throw new BadRequestException('Invalid relation reference');
    }
  }
  throw error; // re-throw unknown errors — let the global filter handle them
}
```

## Usage Pattern in Services

Wrap Prisma write operations in try/catch and call `handlePrismaError`:

```typescript
async create(dto: CreateOrderRequestDto): Promise<OrderResponseDto> {
  try {
    const order = await this.prisma.order.create({ data: dto });
    return this.mapToResponse(order);
  } catch (error) {
    handlePrismaError(error);
  }
}
```

For reads, prefer explicit `findUnique` + null check over try/catch — it's clearer:

```typescript
async findOneOrFail(id: string): Promise<OrderResponseDto> {
  const order = await this.prisma.order.findUnique({ where: { id } });
  if (!order) {
    throw new NotFoundException(`Order ${id} not found`);
  }
  return this.mapToResponse(order);
}
```

## What NOT to Do

```typescript
// ❌ Exposes internal Prisma error details to client
throw new InternalServerErrorException(prismaError.message);

// ❌ Swallows the error — caller gets undefined instead of an exception
try {
  await this.prisma.user.delete({ where: { id } });
} catch {
  console.error('Delete failed');
}

// ❌ Catching too broadly and hiding the real cause
} catch (error) {
  throw new BadRequestException('Something went wrong');
}
```

## Stack Trace Policy

Never include `error.stack` or `error.message` in response DTOs or exception messages visible to the client. Log them internally using the NestJS `Logger`:

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  async someMethod() {
    try {
      // ...
    } catch (error) {
      this.logger.error('Failed to create user', error instanceof Error ? error.stack : error);
      handlePrismaError(error);
    }
  }
}
```
