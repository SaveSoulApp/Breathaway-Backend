import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Global, Module } from '@nestjs/common';
import axios from 'axios';
import { GcpSecretManagerService } from '@core/gcp-secret-manager/gcp-secret-manager.service';
import { InstagramModule } from '@modules/instagram/instagram.module';
import {
  createAuthTestApp,
  getDevLoginCredentials,
  buildBasicAuthHeader,
} from '../helpers/app-test.helper';
import { authedRequest } from '../helpers/request.helper';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

@Global()
@Module({
  providers: [
    {
      provide: GcpSecretManagerService,
      useValue: { upsertSecret: jest.fn() },
    },
  ],
  exports: [GcpSecretManagerService],
})
class MockGcpModule {}

describe('InstagramController (e2e)', () => {
  let app: INestApplication;
  let configService: ConfigService;
  let gcpSecretManager: GcpSecretManagerService;
  let basicAuthHeader: string;

  beforeAll(async () => {
    const context = await createAuthTestApp([MockGcpModule, InstagramModule]);
    app = context.app;
    configService = app.get(ConfigService);
    gcpSecretManager = app.get(GcpSecretManagerService);

    const { username, password } = getDevLoginCredentials(configService);
    basicAuthHeader = buildBasicAuthHeader(username, password);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/instagram/refresh-token', () => {
    it('200 – refreshes access token and saves to secret manager', async () => {
      const mockResponse = {
        data: { access_token: 'new-access-token', token_type: 'bearer' },
      };
      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const res = await authedRequest(app)
        .get('/api/v1/instagram/refresh-token?token=old-token')
        .set('authorization', basicAuthHeader);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(mockResponse.data);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: 'old-token',
          },
        },
      );
      expect(gcpSecretManager.upsertSecret).toHaveBeenCalledWith(
        'access-token-instagram',
        'new-access-token',
      );
    });

    it('401 – unauthorized if basic auth missing', async () => {
      const res = await authedRequest(app).get(
        '/api/v1/instagram/refresh-token?token=old-token',
      );
      expect(res.status).toBe(401);
    });

    it('500 – handles instagram api failure', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { data: 'API Error', status: 500 },
      });

      const res = await authedRequest(app)
        .get('/api/v1/instagram/refresh-token?token=old-token')
        .set('authorization', basicAuthHeader);

      expect(res.status).toBe(502);
    });
  });

  describe('GET /api/v1/instagram/refresh-env-token', () => {
    it('200 – refreshes system access token using config', async () => {
      const mockResponse = { data: { access_token: 'new-env-token' } };
      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const envToken = configService.get<string>('INSTAGRAM_ACCESS_TOKEN');

      const res = await authedRequest(app)
        .get('/api/v1/instagram/refresh-env-token')
        .set('authorization', basicAuthHeader);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(mockResponse.data);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: envToken,
          },
        },
      );
      expect(gcpSecretManager.upsertSecret).toHaveBeenCalledWith(
        'access-token-instagram',
        'new-env-token',
      );
    });
  });
});
