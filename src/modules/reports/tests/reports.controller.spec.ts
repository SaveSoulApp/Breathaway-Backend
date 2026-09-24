import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { AdminBasicAuthGuard } from '@modules/admin/guards/admin-basic-auth.guard';

import {
  GetReportRequestDto,
  ReportTimeframeResponseDto,
  ReportTotalResponseDto,
} from '../dto';
import { ReportsController } from '../reports.controller';
import { ReportsService } from '../reports.service';

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: jest.Mocked<ReportsService>;

  const mockTotalReport = {
    users: {
      total: 100,
      completedProfiles: 80,
      demographics: {
        male: 50,
        female: 40,
        nonbinary: 5,
        other: 3,
        unknown: 2,
      },
    },
    identities: {
      total: 150,
      averagePerUser: 1.5,
      split: {
        instagram: 60,
        phone: 50,
        email: 30,
        linkedin: 5,
        twitter: 3,
        other: 2,
      },
    },
    devices: {
      total: 120,
      active: 90,
      averagePerUser: 1.2,
      platformSplit: {
        android: 70,
        ios: 50,
      },
    },
    likes: {
      total: 200,
      averagePerUser: 2,
      targetIdentitySplit: {
        instagram: 100,
        phone: 60,
        email: 20,
        linkedin: 10,
        twitter: 5,
        other: 5,
      },
      intentSplit: {
        relationship: { count: 120, percentage: 60 },
        casual: { count: 50, percentage: 25 },
        open: { count: 30, percentage: 15 },
      },
    },
    matches: {
      total: 40,
      averagePerUser: 0.4,
    },
    blocks: {
      total: 5,
    },
    credits: {
      given: {
        total: 500,
        splitBySource: {
          purchase: 300,
          bonus: 100,
          referral: 50,
          admin: 30,
          likeUsage: 20,
        },
      },
      utilisedTotal: 250,
    },
  } as ReportTotalResponseDto;

  const mockTimeframeReport = {
    timeframe: {
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-31T23:59:59.999Z'),
    },
    users: {
      acquired: 20,
      demographics: {
        male: 10,
        female: 8,
        nonbinary: 1,
        other: 1,
        unknown: 0,
      },
    },
    identities: {
      created: 30,
      split: {
        instagram: 15,
        phone: 10,
        email: 5,
        linkedin: 0,
        twitter: 0,
        other: 0,
      },
    },
    devices: {
      registered: 25,
      platformSplit: {
        android: 15,
        ios: 10,
      },
    },
    likes: {
      made: 50,
      targetIdentitySplit: {
        instagram: 25,
        phone: 15,
        email: 5,
        linkedin: 2,
        twitter: 2,
        other: 1,
      },
      intentSplit: {
        relationship: { count: 30, percentage: 60 },
        casual: { count: 15, percentage: 30 },
        open: { count: 5, percentage: 10 },
      },
    },
    matches: {
      matched: 10,
    },
    blocks: {
      total: 2,
    },
    credits: {
      given: {
        total: 100,
        splitBySource: {
          purchase: 60,
          bonus: 20,
          referral: 10,
          admin: 10,
          likeUsage: 0,
        },
      },
      utilisedTotal: 50,
    },
  } as ReportTimeframeResponseDto;

  beforeEach(async () => {
    const mockReportsService = {
      generateTotalReport: jest.fn(),
      generateTimeframeReport: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ReportsService, useValue: mockReportsService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    })
      .overrideGuard(AdminBasicAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<ReportsController>(ReportsController);
    service = module.get(ReportsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTotalReport', () => {
    it('should delegate to reportsService.generateTotalReport and return total report', async () => {
      // Arrange
      service.generateTotalReport.mockResolvedValue(mockTotalReport);

      // Act
      const result = await controller.getTotalReport();

      // Assert
      expect(service.generateTotalReport).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTotalReport);
    });
  });

  describe('getTimeframeReport', () => {
    it('should delegate to reportsService.generateTimeframeReport with query and return timeframe report', async () => {
      // Arrange
      const query: GetReportRequestDto = {
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        endDate: new Date('2024-01-31T23:59:59.999Z'),
      };
      service.generateTimeframeReport.mockResolvedValue(mockTimeframeReport);

      // Act
      const result = await controller.getTimeframeReport(query);

      // Assert
      expect(service.generateTimeframeReport).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockTimeframeReport);
    });
  });
});
