import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { AdminService } from '../admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: jest.Mocked<PrismaService>;

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: { emit: jest.fn(), emitAsync: jest.fn() } },
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

    it('should throw NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccount(userId, reason)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if user is already deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({
        deletedAt: new Date(),
      } as any);

      await expect(service.deleteAccount(userId, reason)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should soft delete user and related data within a transaction', async () => {
      prisma.user.findUnique.mockResolvedValue({
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
});
