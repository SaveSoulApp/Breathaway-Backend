import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { AuthSignupDto, AuthSigninDto, AddSecondaryAuthDto } from '../dto';

// Mock nanoid to avoid ESM import issues
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-nanoid-123'),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthService = {
    signup: jest.fn(),
    signin: jest.fn(),
    signInOrSignUp: jest.fn(),
    addSecondaryAuth: jest.fn(),
    signout: jest.fn(),
  };

  const mockUserResponse = {
    user_id: 1,
    email: 'test@example.com',
    phone: null,
    email_verified: true,
    phone_verified: false,
    created_at: new Date(),
    updated_at: new Date(),
    access_token: 'mock-jwt-token',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('signup', () => {
    const signupDto: AuthSignupDto = {
      uid: 'firebase-uid-123',
      uidToken: 'firebase-token-123',
    };

    it('should call authService.signup with correct parameters', async () => {
      mockAuthService.signup.mockResolvedValue(mockUserResponse);

      const result = await controller.signup(signupDto);

      expect(mockAuthService.signup).toHaveBeenCalledWith(signupDto);
      expect(result).toEqual(mockUserResponse);
    });

    it('should return user with access token', async () => {
      mockAuthService.signup.mockResolvedValue(mockUserResponse);

      const result = await controller.signup(signupDto);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('user_id');
      expect(result).toHaveProperty('email');
    });

    it('should delegate to service and return result', async () => {
      const customResponse = {
        ...mockUserResponse,
        email: 'custom@example.com',
      };
      mockAuthService.signup.mockResolvedValue(customResponse);

      const result = await controller.signup(signupDto);

      expect(result).toEqual(customResponse);
    });
  });

  describe('signin', () => {
    const signinDto: AuthSigninDto = {
      uid: 'firebase-uid-123',
      uidToken: 'firebase-token-123',
    };

    it('should call authService.signin with correct parameters', async () => {
      mockAuthService.signin.mockResolvedValue(mockUserResponse);

      const result = await controller.signin(signinDto);

      expect(mockAuthService.signin).toHaveBeenCalledWith(signinDto);
      expect(result).toEqual(mockUserResponse);
    });

    it('should return user with access token', async () => {
      mockAuthService.signin.mockResolvedValue(mockUserResponse);

      const result = await controller.signin(signinDto);

      expect(result).toHaveProperty('access_token');
      expect(result.access_token).toBe('mock-jwt-token');
    });

    it('should handle existing user signin', async () => {
      const existingUserResponse = {
        ...mockUserResponse,
        user_id: 999,
        email: 'existing@example.com',
      };
      mockAuthService.signin.mockResolvedValue(existingUserResponse);

      const result = await controller.signin(signinDto);

      expect(result.user_id).toBe(999);
      expect(result.email).toBe('existing@example.com');
    });
  });

  describe('signinOrSignup', () => {
    const signinOrSignupDto: AuthSigninDto = {
      uid: 'firebase-uid-123',
      uidToken: 'firebase-token-123',
    };

    it('should call authService.signInOrSignUp with correct parameters', async () => {
      mockAuthService.signInOrSignUp.mockResolvedValue(mockUserResponse);

      const result = await controller.signinOrSignup(signinOrSignupDto);

      expect(mockAuthService.signInOrSignUp).toHaveBeenCalledWith(
        signinOrSignupDto,
      );
      expect(result).toEqual(mockUserResponse);
    });

    it('should handle signin for existing user', async () => {
      const existingUser = {
        ...mockUserResponse,
        user_id: 123,
      };
      mockAuthService.signInOrSignUp.mockResolvedValue(existingUser);

      const result = await controller.signinOrSignup(signinOrSignupDto);

      expect(result.user_id).toBe(123);
    });

    it('should handle signup for new user', async () => {
      const newUser = {
        ...mockUserResponse,
        user_id: 456,
        email: 'newuser@example.com',
      };
      mockAuthService.signInOrSignUp.mockResolvedValue(newUser);

      const result = await controller.signinOrSignup(signinOrSignupDto);

      expect(result.user_id).toBe(456);
      expect(result.email).toBe('newuser@example.com');
    });
  });

  describe('addPhone', () => {
    const userId = 1;
    const addPhoneDto: AddSecondaryAuthDto = {
      uid: 'firebase-uid-123',
      uidToken: 'firebase-token-123',
    };

    it('should call authService.addSecondaryAuth with phone type', async () => {
      const updatedUser = {
        ...mockUserResponse,
        phone: '+1234567890',
        phone_verified: true,
      };
      mockAuthService.addSecondaryAuth.mockResolvedValue(updatedUser);

      const result = await controller.addPhone(userId, addPhoneDto);

      expect(mockAuthService.addSecondaryAuth).toHaveBeenCalledWith(
        userId,
        addPhoneDto,
        'phone',
      );
      expect(result).toEqual(updatedUser);
    });

    it('should return updated user with phone', async () => {
      const updatedUser = {
        ...mockUserResponse,
        phone: '+1234567890',
        phone_verified: true,
      };
      mockAuthService.addSecondaryAuth.mockResolvedValue(updatedUser);

      const result = await controller.addPhone(userId, addPhoneDto);

      expect(result.phone).toBe('+1234567890');
      expect(result.phone_verified).toBe(true);
    });

    it('should use userId from authenticated user', async () => {
      mockAuthService.addSecondaryAuth.mockResolvedValue(mockUserResponse);

      await controller.addPhone(userId, addPhoneDto);

      expect(mockAuthService.addSecondaryAuth).toHaveBeenCalledWith(
        userId,
        expect.any(Object),
        'phone',
      );
    });
  });

  describe('addEmail', () => {
    const userId = 1;
    const addEmailDto: AddSecondaryAuthDto = {
      uid: 'firebase-uid-123',
      uidToken: 'firebase-token-123',
    };

    it('should call authService.addSecondaryAuth with email type', async () => {
      const updatedUser = {
        ...mockUserResponse,
        email: 'newemail@example.com',
        email_verified: true,
      };
      mockAuthService.addSecondaryAuth.mockResolvedValue(updatedUser);

      const result = await controller.addEmail(userId, addEmailDto);

      expect(mockAuthService.addSecondaryAuth).toHaveBeenCalledWith(
        userId,
        addEmailDto,
        'email',
      );
      expect(result).toEqual(updatedUser);
    });

    it('should return updated user with email', async () => {
      const updatedUser = {
        ...mockUserResponse,
        email: 'newemail@example.com',
        email_verified: true,
      };
      mockAuthService.addSecondaryAuth.mockResolvedValue(updatedUser);

      const result = await controller.addEmail(userId, addEmailDto);

      expect(result.email).toBe('newemail@example.com');
      expect(result.email_verified).toBe(true);
    });

    it('should use userId from authenticated user', async () => {
      mockAuthService.addSecondaryAuth.mockResolvedValue(mockUserResponse);

      await controller.addEmail(userId, addEmailDto);

      expect(mockAuthService.addSecondaryAuth).toHaveBeenCalledWith(
        userId,
        expect.any(Object),
        'email',
      );
    });
  });

  describe('signout', () => {
    it('should call authService.signout', async () => {
      const signoutResponse = { message: 'Hello World' };
      mockAuthService.signout.mockResolvedValue(signoutResponse);

      const result = await controller.signout();

      expect(mockAuthService.signout).toHaveBeenCalled();
      expect(result).toEqual(signoutResponse);
    });

    it('should return signout response', async () => {
      const signoutResponse = { message: 'Hello World' };
      mockAuthService.signout.mockResolvedValue(signoutResponse);

      const result = await controller.signout();

      expect(result).toHaveProperty('message');
    });
  });
});
