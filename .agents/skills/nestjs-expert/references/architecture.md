# Architecture Reference

## Module Structure

Every feature lives under `src/modules/<feature-name>/`. The folder layout is fixed:

```
src/modules/users/
├── users.module.ts
├── users.controller.ts
├── users.service.ts
├── users.service.spec.ts
└── dto/
    ├── index.ts
    ├── request/
    │   ├── create-user.request.dto.ts
    │   └── update-user.request.dto.ts
    └── response/
        └── user.response.dto.ts
```

Cross-module imports use absolute paths: `src/modules/prisma/prisma.service`.
Same-module imports use relative paths: `./dto/request/create-user.request.dto`.

## Module Definition

```typescript
// src/modules/users/users.module.ts
import { Module } from '@nestjs/common';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // only export if other modules need it
})
export class UsersModule {}
```

`PrismaModule` is global — never import `PrismaService` into the module providers list. It's already available via DI.

## Controller Patterns

Controllers own routing, HTTP codes, Swagger docs, and body/param/query parsing. Nothing else.

```typescript
// src/modules/users/users.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CreateUserRequestDto } from './dto/request/create-user.request.dto';
import { UpdateUserRequestDto } from './dto/request/update-user.request.dto';
import { UserResponseDto } from './dto/response/user.response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ description: 'User created.', type: UserResponseDto })
  create(@Body() dto: CreateUserRequestDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UserResponseDto })
  findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOneOrFail(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserRequestDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}
```

## Service Patterns

Services own business logic and all Prisma calls. They must:

- Return typed response DTOs, never raw Prisma models
- Use a private `mapToResponse()` method for entity → DTO mapping
- Throw NestJS HTTP exceptions (not custom error classes) so the global filter catches them

```typescript
// src/modules/users/users.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from 'src/modules/prisma/prisma.service';

import { CreateUserRequestDto } from './dto/request/create-user.request.dto';
import { UpdateUserRequestDto } from './dto/request/update-user.request.dto';
import { UserResponseDto } from './dto/response/user.response.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserRequestDto): Promise<UserResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException(`Email ${dto.email} is already registered`);
    }

    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash: dto.password },
    });
    return this.mapToResponse(user);
  }

  async findOneOrFail(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return this.mapToResponse(user);
  }

  async update(
    id: string,
    dto: UpdateUserRequestDto,
  ): Promise<UserResponseDto> {
    await this.findOneOrFail(id); // validate existence first
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
    });
    return this.mapToResponse(user);
  }

  async remove(id: string): Promise<void> {
    await this.findOneOrFail(id);
    await this.prisma.user.delete({ where: { id } });
  }

  private mapToResponse(user: { id: string; email: string }): UserResponseDto {
    return { id: user.id, email: user.email };
    // Never include passwordHash, deletedAt, or internal fields here
  }
}
```

## Prisma Transactions

Use `$transaction` whenever two or more writes must succeed or fail together. The interactive client form is preferred over the array form because it supports retries and nested logic:

```typescript
async transferCredits(fromId: string, toId: string, amount: number): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const sender = await tx.wallet.findUnique({ where: { userId: fromId } });
    if (!sender || sender.balance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    await tx.wallet.update({
      where: { userId: fromId },
      data: { balance: { decrement: amount } },
    });
    await tx.wallet.update({
      where: { userId: toId },
      data: { balance: { increment: amount } },
    });
    await tx.ledgerEntry.create({
      data: { fromId, toId, amount },
    });
  });
}
```

Never split interdependent writes across multiple non-transactional calls.

## Unit Tests

Test services, not controllers. Mock `PrismaService` with `jest.fn()` stubs:

```typescript
// src/modules/users/users.service.spec.ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from 'src/modules/prisma/prisma.service';

import { UsersService } from './users.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('throws ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'a@b.com',
      });
      await expect(
        service.create({ email: 'a@b.com', password: 'secret123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns a UserResponseDto on success', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: '2', email: 'new@b.com' });
      const result = await service.create({
        email: 'new@b.com',
        password: 'secret123',
      });
      expect(result).toEqual({ id: '2', email: 'new@b.com' });
    });
  });

  describe('findOneOrFail', () => {
    it('throws NotFoundException if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOneOrFail('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
```
