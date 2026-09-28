jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}));

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';

import * as basicAuthModule from '../swagger-basic-auth.config';
import { setupSwagger } from '../swagger.config';

jest.mock('@nestjs/swagger', () => {
  const actual = jest.requireActual('@nestjs/swagger');
  return {
    ...actual,
    SwaggerModule: {
      createDocument: jest.fn().mockReturnValue({
        paths: {
          '/api/v1/test': {
            get: {
              summary: 'Test endpoint',
              security: [],
            },
            post: {
              summary: 'Test post',
              security: [{ bearer: [] }],
            },
          },
        },
      }),
      setup: jest.fn(),
    },
  };
});

jest.mock('redoc-express', () => {
  return jest.fn().mockReturnValue(jest.fn());
});

describe('setupSwagger', () => {
  let appMock: { use: jest.Mock; getHttpAdapter: jest.Mock };
  let configServiceMock: { get: jest.Mock; getOrThrow: jest.Mock };
  let applyBasicAuthSpy: jest.SpyInstance;

  beforeEach(() => {
    appMock = {
      use: jest.fn(),
      getHttpAdapter: jest.fn().mockReturnValue({
        get: jest.fn(),
      }),
    };

    configServiceMock = {
      get: jest.fn(),
      getOrThrow: jest.fn().mockReturnValue('test-val'),
    };

    applyBasicAuthSpy = jest
      .spyOn(basicAuthModule, 'applySwaggerBasicAuth')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return early when SWAGGER_ENABLED is not true', () => {
    configServiceMock.get.mockReturnValue('false');

    setupSwagger(
      appMock as unknown as INestApplication,
      configServiceMock as unknown as ConfigService,
    );

    expect(applyBasicAuthSpy).not.toHaveBeenCalled();
    expect(SwaggerModule.setup).not.toHaveBeenCalled();
    expect(appMock.use).not.toHaveBeenCalled();
  });

  it('should configure and mount swagger docs when SWAGGER_ENABLED is true', () => {
    configServiceMock.get.mockReturnValue('true');

    setupSwagger(
      appMock as unknown as INestApplication,
      configServiceMock as unknown as ConfigService,
    );

    expect(applyBasicAuthSpy).toHaveBeenCalledWith(appMock, configServiceMock);
    expect(SwaggerModule.createDocument).toHaveBeenCalled();
    expect(SwaggerModule.setup).toHaveBeenCalled();
    expect(appMock.use).toHaveBeenCalled();
    expect(appMock.getHttpAdapter).toHaveBeenCalled();
    const adapter = appMock.getHttpAdapter();
    expect(adapter.get).toHaveBeenCalledTimes(2);
  });

  it('should sanitize public and admin docs to prevent route/tag leaks', () => {
    configServiceMock.get.mockReturnValue('true');

    const publicMockDoc = {
      paths: {
        '/api/v1/payments/orders': { post: {} },
        '/api/v1/admin/payments/routes': { get: {} },
      },
      tags: [{ name: 'Payments' }, { name: 'Admin - Payments' }],
    };

    const adminMockDoc = {
      paths: {
        '/api/v1/payments/orders': { post: {} },
        '/api/v1/admin/payments/routes': { get: {} },
      },
      tags: [{ name: 'Payments' }, { name: 'Admin - Payments' }],
    };

    (SwaggerModule.createDocument as jest.Mock)
      .mockReturnValueOnce(publicMockDoc)
      .mockReturnValueOnce(adminMockDoc);

    setupSwagger(
      appMock as unknown as INestApplication,
      configServiceMock as unknown as ConfigService,
    );

    // Assert public doc is sanitized
    expect(publicMockDoc.paths['/api/v1/payments/orders']).toBeDefined();
    expect(
      publicMockDoc.paths['/api/v1/admin/payments/routes'],
    ).toBeUndefined();
    expect(publicMockDoc.tags).toEqual([{ name: 'Payments' }]);

    // Assert admin doc is sanitized
    expect(adminMockDoc.paths['/api/v1/payments/orders']).toBeUndefined();
    expect(adminMockDoc.paths['/api/v1/admin/payments/routes']).toBeDefined();
    expect(adminMockDoc.tags).toEqual([{ name: 'Admin - Payments' }]);
  });
});
