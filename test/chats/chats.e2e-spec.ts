import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { ChatsModule } from '@modules/chats/chats.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase SDK for E2E Tests
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('ChatsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];
  let validJwt: string;
  let mockSupabaseClient: any;

  beforeAll(async () => {
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

    process.env.SUPABASE_JWT_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgcl4AW+uYgNuG1Iey\\n5blCle8WbdRdVCU0ClAPSFbLxs2hRANCAATwEcv9fGvVN5FreEQPmiVSYyGRmQD2\\netnwkizwE/WSlBrs74faOuKuFK8qbVtOGryMo/eZvhkPbdIy18ZJXagj\\n-----END PRIVATE KEY-----';

    const context = await createAuthTestApp([ChatsModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Chats Endpoints', () => {
    beforeAll(async () => {
      const user = await prisma.user.create({ data: {} });
      allCreatedUserIds.push(user.id);

      validJwt = jwtService.sign(
        {
          sub: user.id,
          iss: configService.get<string>('JWT_ISSUER'),
          aud: configService.get<string>('JWT_AUDIENCE'),
        },
        { secret: configService.get<string>('JWT_SECRET') || 'test-secret' },
      );
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('GET /api/v1/chats/supabase-token - retrieves JWT', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/chats/supabase-token')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
    });

    it('POST /api/v1/chats/messages - sends a message', async () => {
      const mockMessage = { id: 'msg-1', content: 'e2e-hello' };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'room-1' },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockMessage,
        error: null,
      });

      const res = await authedRequest(app)
        .post('/api/v1/chats/messages')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          targetUserId: 'user-b',
          content: 'e2e-hello',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject(mockMessage);
    });

    it('POST /api/v1/chats/:roomId/messages/read - marks messages read', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { createdAt: '2023-01-01' },
        error: null,
      });
      mockSupabaseClient.lte.mockResolvedValueOnce({ error: null });

      const res = await authedRequest(app)
        .post('/api/v1/chats/room-1/messages/read')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          messageId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('GET /api/v1/chats/:roomId/messages - fetches messages', async () => {
      const mockMessages = [{ id: 'msg-1' }];
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: mockMessages,
        error: null,
      });

      const res = await authedRequest(app)
        .get('/api/v1/chats/room-1/messages?limit=10')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual(mockMessages);
    });
  });
});
