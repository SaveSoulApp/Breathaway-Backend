import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { OneTimePasswordsController } from '../one-time-passwords.controller';
import { OneTimePasswordsService } from '../one-time-passwords.service';
import { VerifyOtpDto } from '../dto';
import { ClsService } from 'nestjs-cls';

describe('OneTimePasswordsController', () => {
  let controller: OneTimePasswordsController;
  let service: jest.Mocked<OneTimePasswordsService>;

  const userId = 'user-id-123';

  beforeEach(async () => {
    const mockService = {
      generateAndStoreOtp: jest.fn(),
      verifyAndConsumeOtp: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OneTimePasswordsController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: OneTimePasswordsService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<OneTimePasswordsController>(
      OneTimePasswordsController,
    );
    service = module.get(OneTimePasswordsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateOtp', () => {
    it('should generate and return a new OTP', async () => {
      // Arrange
      const resultData = { otp: 'abc-def-ghi', expiresIn: 300 };
      service.generateAndStoreOtp.mockResolvedValue(resultData);

      // Act
      const result = await controller.generateOtp(userId);

      // Assert
      expect(service.generateAndStoreOtp).toHaveBeenCalledWith(userId);
      expect(result).toEqual(resultData);
    });
  });

  describe('verifyOtp', () => {
    it('should verify the OTP and return the userId', async () => {
      // Arrange
      const dto: VerifyOtpDto = { otp: 'abc-def-ghi' };
      service.verifyAndConsumeOtp.mockResolvedValue(userId);

      // Act
      const result = await controller.verifyOtp(dto);

      // Assert
      expect(service.verifyAndConsumeOtp).toHaveBeenCalledWith(dto.otp);
      expect(result).toEqual({ userId });
    });
  });
});
