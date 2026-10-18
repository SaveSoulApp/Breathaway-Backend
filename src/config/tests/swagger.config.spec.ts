jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}));

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import redoc from 'redoc-express';

import { SocialIdentitiesModule } from '@modules/social-identities/social-identities.module';
import { UsersModule } from '@modules/users/users.module';

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
        '/api/v1/users/me/export': { post: {}, get: {} },
        '/api/v1/social-identities/verify/instagram': { post: {} },
        '/api/v1/internal/jobs/expire-bundles': { post: {} },
      },
      tags: [
        { name: 'Payments' },
        { name: 'Admin - Payments' },
        { name: 'Users' },
      ],
    };

    const adminMockDoc = {
      paths: {
        '/api/v1/payments/orders': { post: {} },
        '/api/v1/admin/payments/routes': { get: {} },
        '/api/v1/social-identities/verify/instagram': { post: {} },
      },
      tags: [
        { name: 'Payments' },
        { name: 'Admin - Payments' },
        { name: 'Admin - Social Identities' },
      ],
    };

    (SwaggerModule.createDocument as jest.Mock)
      .mockReturnValueOnce(publicMockDoc)
      .mockReturnValueOnce(adminMockDoc);

    setupSwagger(
      appMock as unknown as INestApplication,
      configServiceMock as unknown as ConfigService,
    );

    // Verify module include arrays passed to createDocument
    const publicCall = (SwaggerModule.createDocument as jest.Mock).mock
      .calls[0];
    const adminCall = (SwaggerModule.createDocument as jest.Mock).mock.calls[1];
    expect(publicCall[2].include).toContain(UsersModule);
    expect(publicCall[2].include).not.toContain(SocialIdentitiesModule);
    expect(adminCall[2].include).toContain(SocialIdentitiesModule);
    expect(adminCall[2].include).not.toContain(UsersModule);

    // Assert public doc is sanitized
    expect(publicMockDoc.paths['/api/v1/payments/orders']).toBeDefined();
    expect(publicMockDoc.paths['/api/v1/users/me/export']).toBeDefined();
    expect(
      publicMockDoc.paths['/api/v1/admin/payments/routes'],
    ).toBeUndefined();
    expect(
      publicMockDoc.paths['/api/v1/social-identities/verify/instagram'],
    ).toBeUndefined();
    expect(
      publicMockDoc.paths['/api/v1/internal/jobs/expire-bundles'],
    ).toBeUndefined();
    expect(publicMockDoc.tags).toEqual([
      { name: 'Payments' },
      { name: 'Users' },
    ]);

    // Assert admin doc is sanitized
    expect(adminMockDoc.paths['/api/v1/payments/orders']).toBeUndefined();
    expect(adminMockDoc.paths['/api/v1/admin/payments/routes']).toBeDefined();
    expect(
      adminMockDoc.paths['/api/v1/social-identities/verify/instagram'],
    ).toBeDefined();
    expect(adminMockDoc.tags).toEqual([
      { name: 'Admin - Payments' },
      { name: 'Admin - Social Identities' },
    ]);
  });

  it('should sort tags, paths, and operations in alphabetical order and pass sorting options to ReDoc', () => {
    configServiceMock.get.mockReturnValue('true');

    const publicMockDoc = {
      paths: {
        '/api/v1/webhooks/razorpay': { post: { tags: ['Webhooks'] } },
        '/api/v1/auth/signup': { post: { tags: ['Auth'] } },
        '/api/v1/credits/balance': { get: { tags: ['Credits'] } },
      },
      tags: [{ name: 'Webhooks' }, { name: 'Auth' }, { name: 'Credits' }],
    };

    const adminMockDoc = {
      paths: {
        '/api/v1/admin/transactions': {
          get: { tags: ['Admin - Transactions'] },
        },
        '/api/v1/admin/payments/routes': {
          get: { tags: ['Admin - Payments'] },
        },
      },
      tags: [{ name: 'Admin - Transactions' }, { name: 'Admin - Payments' }],
    };

    (SwaggerModule.createDocument as jest.Mock)
      .mockReturnValueOnce(publicMockDoc)
      .mockReturnValueOnce(adminMockDoc);

    setupSwagger(
      appMock as unknown as INestApplication,
      configServiceMock as unknown as ConfigService,
    );

    // Assert tags are sorted alphabetically in document
    expect(publicMockDoc.tags).toEqual([
      { name: 'Auth' },
      { name: 'Credits' },
      { name: 'Webhooks' },
    ]);
    expect(Object.keys(publicMockDoc.paths)).toEqual([
      '/api/v1/auth/signup',
      '/api/v1/credits/balance',
      '/api/v1/webhooks/razorpay',
    ]);

    expect(adminMockDoc.tags).toEqual([
      { name: 'Admin - Payments' },
      { name: 'Admin - Transactions' },
    ]);
    expect(Object.keys(adminMockDoc.paths)).toEqual([
      '/api/v1/admin/payments/routes',
      '/api/v1/admin/transactions',
    ]);

    // Assert redoc-express was called with sorting options
    expect(redoc).toHaveBeenCalledWith(
      expect.objectContaining({
        redocOptions: expect.objectContaining({
          sortTagsAlphabetically: true,
          sortOperationsAlphabetically: true,
        }),
      }),
    );
  });
});
