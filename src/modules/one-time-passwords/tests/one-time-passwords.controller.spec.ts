import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { OtpController } from '../one-time-passwords.controller';
import { OtpService } from '../one-time-passwords.service';
import { VerifyOtpDto } from '../dto';

describe('OtpController', () => {
  let controller: OtpController;
  let service: jest.Mocked<OtpService>;
  let loggerServiceMock: jest.Mocked<LoggerService>;

  const userId = 'user-id-123';

  beforeEach(async () => {
    const mockService = {
      generateAndStoreOtp: jest.fn(),
      verifyAndConsumeOtp: jest.fn(),
    };

    loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
      }),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OtpController],
      providers: [
        { provide: OtpService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<OtpController>(OtpController);
    service = module.get(OtpService) as jest.Mocked<OtpService>;
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
