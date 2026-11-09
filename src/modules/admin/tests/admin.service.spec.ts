import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthCredentialType, LikeStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';
import { JwtAuthCacheService } from '@modules/auth/services/jwt-auth-cache.service';
import { USER_DELETED_EVENT, UserDeletedEvent } from '@modules/profiles/events';

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
    userSession: { updateMany: jest.fn() },
    device: { updateMany: jest.fn() },
    match: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    like: { updateMany: jest.fn() },
    transaction: { updateMany: jest.fn() },
    block: { updateMany: jest.fn() },
  };

  const mockJwtAuthCacheService = {
    revokeUser: jest.fn().mockResolvedValue(undefined),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockTx)),
    $executeRaw: jest.fn(),
  };

  let mockEventEmitter: { emit: jest.Mock; emitAsync: jest.Mock };

  beforeEach(async () => {
    mockEventEmitter = { emit: jest.fn(), emitAsync: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtAuthCacheService, useValue: mockJwtAuthCacheService },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
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
    const phoneHash = Buffer.from('phone-hash-bytes');

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

    it('should soft delete user and execute complete operational state teardown', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        deletedAt: null,
        identities: [{ id: 'identity-1' }, { id: 'identity-2' }],
        authCredentials: [
          {
            type: AuthCredentialType.PHONE,
            valueHash: phoneHash,
            deletedAt: null,
          },
        ],
      } as any);

      await service.deleteAccount(userId, reason);

      expect(prisma.$transaction).toHaveBeenCalled();

      // 1. User soft delete
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { deletedAt: expect.any(Date) },
      });

      // 2. Identity detach to ghost state
      expect(mockTx.identity.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['identity-1', 'identity-2'] } },
        data: {
          userId: null,
          isVerified: false,
          deletedAt: expect.any(Date),
        },
      });

      // 3. AuthCredential soft delete
      expect(mockTx.authCredential.updateMany).toHaveBeenCalledWith({
        where: { userId, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });

      // 4. UserSession active refresh token revocation
      expect(mockTx.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });

      // 5. Device deactivation
      expect(mockTx.device.updateMany).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        data: { isActive: false },
      });

      // 7. Outbound likes marked DELETED
      expect(mockTx.like.updateMany).toHaveBeenCalledWith({
        where: { senderUserId: userId },
        data: {
          status: LikeStatus.DELETED,
          deletedAt: expect.any(Date),
        },
      });

      // 8. Inbound pending likes marked VOIDED
      expect(mockTx.like.updateMany).toHaveBeenCalledWith({
        where: {
          targetIdentityId: { in: ['identity-1', 'identity-2'] },
          status: LikeStatus.PENDING,
        },
        data: { status: LikeStatus.VOIDED },
      });

      // 9. Transactions stamped with phone hash
      expect(mockTx.transaction.updateMany).toHaveBeenCalledWith({
        where: { userId, userPhoneHash: null },
        data: { userPhoneHash: phoneHash },
      });

      // 10. Blocks stamped with phone hash
      expect(mockTx.block.updateMany).toHaveBeenCalledWith({
        where: { blockedUserId: userId },
        data: {
          blockedPhoneHash: phoneHash,
          blockedUserId: null,
        },
      });

      // Synchronous Redis JWT revocation
      expect(mockJwtAuthCacheService.revokeUser).toHaveBeenCalledWith(userId);

      // Audit and event emission
      expect((service as any).emitAuditLog).toHaveBeenCalledWith({
        actionType: AuditActionType.ADMIN_ACCOUNT_DELETED,
        userId,
        metadata: {
          deletedUserId: userId,
          reason,
        },
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        USER_DELETED_EVENT,
        new UserDeletedEvent(userId),
      );
    });

    it('should dissolve active matches and void counterpart likes when matches exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        deletedAt: null,
        identities: [],
        authCredentials: [],
      } as any);

      mockTx.match.findMany.mockResolvedValueOnce([
        {
          id: 'match-1',
          userOneId: userId,
          userTwoId: 'counterpart-user',
          likeOneId: 'my-like',
          likeTwoId: 'counterpart-like',
        },
      ]);

      await service.deleteAccount(userId, reason);

      expect(mockTx.like.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['counterpart-like'] } },
        data: { status: LikeStatus.VOIDED },
      });

      expect(mockTx.match.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['match-1'] } },
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
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

      // Act
      const result = await service.truncateDatabase(dto);

      // Assert
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const callArg = (prisma.$executeRaw as jest.Mock).mock.calls[0][0];
      const executedSql: string = Array.isArray(callArg)
        ? callArg.join(' ')
        : String(callArg);

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

    it('should rethrow error if $executeRaw fails', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      (prisma.$executeRaw as jest.Mock).mockRejectedValue(dbError);

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
