import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';

import { AdminService, TRUNCATED_DATABASE_TABLES } from '../admin.service';
import { AdminUserNotFoundException } from '../application/exceptions';
import { TruncateDatabaseRequestDto } from '../dto';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: jest.Mocked<PrismaService>;

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      event: jest.fn(),
    }),
  };

  const mockTx = {
    user: { update: jest.fn() },
    identity: { updateMany: jest.fn() },
    authCredential: { updateMany: jest.fn() },
    device: { updateMany: jest.fn() },
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockTx)),
    $executeRawUnsafe: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), emitAsync: jest.fn() },
        },
        { provide: ClsService, useValue: { get: jest.fn(), set: jest.fn() } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get(PrismaService);

    // Mock emitAuditLog (protected method on BaseService)
    (service as any).emitAuditLog = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('deleteAccount', () => {
    const userId = 'user-uuid';
    const reason = 'Violation of terms';

    it('should throw AdminUserNotFoundException if user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteAccount(userId, reason)).rejects.toThrow(
        AdminUserNotFoundException,
      );
    });

    it('should throw AdminUserNotFoundException if user is already deleted', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        deletedAt: new Date(),
      } as any);

      await expect(service.deleteAccount(userId, reason)).rejects.toThrow(
        AdminUserNotFoundException,
      );
    });

    it('should soft delete user and related data within a transaction', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        deletedAt: null,
      } as any);

      await service.deleteAccount(userId, reason);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockTx.identity.updateMany).toHaveBeenCalledWith({
        where: { userId, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockTx.authCredential.updateMany).toHaveBeenCalledWith({
        where: { userId, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockTx.device.updateMany).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        data: { isActive: false },
      });

      expect((service as any).emitAuditLog).toHaveBeenCalledWith({
        actionType: AuditActionType.ADMIN_ACCOUNT_DELETED,
        userId,
        metadata: {
          deletedUserId: userId,
          reason,
        },
      });
    });
  });

  describe('truncateDatabase', () => {
    const dto: TruncateDatabaseRequestDto = {
      confirmation: 'CONFIRM_TRUNCATE',
      reason: 'Automated test suite reset',
    };

    it('should execute raw SQL truncate with CASCADE across all 20 tables and return response', async () => {
      // Arrange
      (prisma.$executeRawUnsafe as jest.Mock).mockResolvedValue(1);

      // Act
      const result = await service.truncateDatabase(dto);

      // Assert
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      const executedSql: string = (prisma.$executeRawUnsafe as jest.Mock).mock
        .calls[0][0];

      expect(executedSql).toContain('TRUNCATE TABLE');
      expect(executedSql).toContain('CASCADE');
      expect(executedSql).toContain('RESTART IDENTITY');

      // Verify each of the 20 tables is included
      for (const table of TRUNCATED_DATABASE_TABLES) {
        expect(executedSql).toContain(`"${table}"`);
      }

      // Verify preserved tables are NOT included in the SQL
      expect(executedSql).not.toContain('"SubscriptionPlan"');
      expect(executedSql).not.toContain('"SubscriptionPlanPrice"');
      expect(executedSql).not.toContain('"SubscriptionPlanPriceHistory"');
      expect(executedSql).not.toContain('"PaymentGatewayRoute"');

      // Verify audit and logger events
      expect((service as any).emitAuditLog).toHaveBeenCalledWith({
        actionType: AuditActionType.ADMIN_DATABASE_TRUNCATED,
        userId: 'SYSTEM',
        metadata: {
          truncatedTables: [...TRUNCATED_DATABASE_TABLES],
          reason: dto.reason,
        },
      });

      expect((service as any).logger.event).toHaveBeenCalledWith(
        LOG_EVENT.ADMIN_DATABASE_TRUNCATED,
        {
          truncatedTables: [...TRUNCATED_DATABASE_TABLES],
          reason: dto.reason,
        },
      );

      expect(result).toEqual({
        success: true,
        message: 'Database truncated successfully',
        truncatedTables: [...TRUNCATED_DATABASE_TABLES],
        timestamp: expect.any(String),
      });
    });

    it('should rethrow error if $executeRawUnsafe fails', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      (prisma.$executeRawUnsafe as jest.Mock).mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.truncateDatabase(dto)).rejects.toThrow(
        'Database connection failed',
      );
      expect((service as any).logger.error).toHaveBeenCalledWith(
        'Admin database truncate failed',
        expect.objectContaining({
          step: 'execute_truncate',
          reason: dto.reason,
        }),
      );
    });
  });
});
