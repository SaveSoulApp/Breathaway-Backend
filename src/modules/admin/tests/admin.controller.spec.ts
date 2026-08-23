import { LoggerService } from '@core/logger';
import { CreditsService } from '@modules/credits/credits.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from '../admin.controller';
import { AdminService } from '../admin.service';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;
  let creditsService: jest.Mocked<CreditsService>;

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  };

  beforeEach(async () => {
    const mockAdminService = {
      deleteAccount: jest.fn(),
    };

    const mockCreditsService = {
      grantCredits: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: AdminService, useValue: mockAdminService },
        { provide: CreditsService, useValue: mockCreditsService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get(AdminService);
    creditsService = module.get(CreditsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('deleteAccount', () => {
    it('should call adminService.deleteAccount and return void', async () => {
      adminService.deleteAccount.mockResolvedValue(undefined);

      await controller.deleteAccount('user-1', { reason: 'Violated terms' });

      expect(adminService.deleteAccount).toHaveBeenCalledWith(
        'user-1',
        'Violated terms',
      );
    });
  });

  describe('grantCredits', () => {
    it('should call creditsService.grantCredits with dto, undefined, no tx, and timezone from req', async () => {
      // Arrange
      const mockLedgerEntry = { id: 'entry-1', amount: 100 } as any;
      creditsService.grantCredits.mockResolvedValue(mockLedgerEntry);

      const dto = {
        userId: 'user-1',
        amount: 100,
        source: 'ADMIN_GRANT' as any,
      };

      // The controller reads timezone from req (attached by TimezoneMiddleware).

      // Act
      const result = await controller.grantCredits(dto);

      expect(creditsService.grantCredits).toHaveBeenCalledWith(dto, undefined);
      expect(result).toEqual(mockLedgerEntry);
    });
  });
});
