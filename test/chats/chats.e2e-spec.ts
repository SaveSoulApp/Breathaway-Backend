import { randomUUID } from 'crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  IdentityType,
  IntentType,
  LikeStatus,
  MatchStatus,
} from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { ChatsModule } from '@modules/chats/chats.module';
import { ChatCryptoService } from '@modules/chats/services/chat-crypto.service';

import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

// Mock Supabase SDK for E2E Tests
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('ChatsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let chatCryptoService: ChatCryptoService;

  const validRoomId = randomUUID();
  const otherRoomId = randomUUID();
  let wrappedRoomKey: string;
  let roomKeyId: string;
  let rawKey: Buffer;

  const allCreatedUserIds: string[] = [];
  let validJwt: string;
  let seededUserId: string;
  let matchedUserId: string;
  let unmatchedUserId: string;
  let mockSupabaseClient: any;

  beforeAll(async () => {
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

    process.env.SUPABASE_JWT_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgcl4AW+uYgNuG1Iey\n5blCle8WbdRdVCU0ClAPSFbLxs2hRANCAATwEcv9fGvVN5FreEQPmiVSYyGRmQD2\netnwkizwE/WSlBrs74faOuKuFK8qbVtOGryMo/eZvhkPbdIy18ZJXagj\n-----END PRIVATE KEY-----';

    const context = await createAuthTestApp([ChatsModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
    chatCryptoService = app.get(ChatCryptoService);

    rawKey = chatCryptoService.generateRoomKey();
    const wrapped = chatCryptoService.wrapRoomKey(rawKey);
    wrappedRoomKey = wrapped.wrappedRoomKey;
    roomKeyId = wrapped.roomKeyId;

    // Seed test users
    const user1 = await prisma.user.create({ data: {} });
    seededUserId = user1.id;
    allCreatedUserIds.push(user1.id);

    validJwt = jwtService.sign(
      {
        sub: user1.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      },
      { secret: configService.get<string>('JWT_SECRET') || 'test-secret' },
    );

    // Seed matched user and establish reciprocal likes + active match
    const user2 = await prisma.user.create({ data: {} });
    matchedUserId = user2.id;
    allCreatedUserIds.push(user2.id);

    const suffix = Date.now().toString();
    const id1 = await prisma.identity.create({
      data: {
        userId: user1.id,
        type: IdentityType.PHONE,
        publicValueHash: `chat-id1-${suffix}`,
        publicValueCiphertext: 'c1',
        publicValueIv: 'iv1',
        publicValueTag: 't1',
        publicValueWrappedKey: 'k1',
        publicValueKeyId: 'kid1',
      },
    });

    const id2 = await prisma.identity.create({
      data: {
        userId: user2.id,
        type: IdentityType.PHONE,
        publicValueHash: `chat-id2-${suffix}`,
        publicValueCiphertext: 'c2',
        publicValueIv: 'iv2',
        publicValueTag: 't2',
        publicValueWrappedKey: 'k2',
        publicValueKeyId: 'kid2',
      },
    });

    const like1 = await prisma.like.create({
      data: {
        senderUserId: user1.id,
        targetIdentityId: id2.id,
        intent: IntentType.OPEN,
        status: LikeStatus.MATCHED,
      },
    });

    const like2 = await prisma.like.create({
      data: {
        senderUserId: user2.id,
        targetIdentityId: id1.id,
        intent: IntentType.OPEN,
        status: LikeStatus.MATCHED,
      },
    });

    await prisma.match.create({
      data: {
        userOneId: user1.id,
        userTwoId: user2.id,
        likeOneId: like1.id,
        likeTwoId: like2.id,
        intentOne: IntentType.OPEN,
        intentTwo: IntentType.OPEN,
        status: MatchStatus.ACTIVE,
      },
    });

    // Seed unmatched user for authorization edge case testing
    const user3 = await prisma.user.create({ data: {} });
    unmatchedUserId = user3.id;
    allCreatedUserIds.push(user3.id);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Chats Endpoints', () => {
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

    it('GET /api/v1/chats/supabase-token - rejects unauthenticated request (401)', async () => {
      const res = await authedRequest(app).get('/api/v1/chats/supabase-token');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/chats/messages - sends a message to an actively matched user (201)', async () => {
      const mockMessage = { id: 'msg-1', content: 'e2e-hello' };
      // 1st maybeSingle() resolves the room lookup
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: {
          id: validRoomId,
          userOneId: seededUserId,
          userTwoId: matchedUserId,
          wrappedRoomKey,
          roomKeyId,
        },
        error: null,
      });
      // 2nd single() resolves the message insert
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockMessage,
        error: null,
      });

      const res = await authedRequest(app)
        .post('/api/v1/chats/messages')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          targetUserId: matchedUserId,
          content: 'e2e-hello',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject(mockMessage);
    });

    it('POST /api/v1/chats/messages - rejects messaging yourself (400 SelfMessageException)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/chats/messages')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          targetUserId: seededUserId,
          content: 'Self message test',
        });

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/chats/messages - rejects messaging a user without an active match (403)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/chats/messages')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          targetUserId: unmatchedUserId,
          content: 'Unmatched message test',
        });

      expect(res.status).toBe(403);
    });

    it('POST /api/v1/chats/:roomId/messages/read - marks messages read for room participant (200)', async () => {
      // 1st single() resolves assertRoomParticipant for ChatRoom
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: validRoomId,
          userOneId: seededUserId,
          userTwoId: matchedUserId,
          wrappedRoomKey,
          roomKeyId,
        },
        error: null,
      });
      // 2nd single() resolves the reference Message lookup
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { createdAt: '2023-01-01T00:00:00.000Z' },
        error: null,
      });
      mockSupabaseClient.lte.mockResolvedValueOnce({ error: null });

      const res = await authedRequest(app)
        .post(`/api/v1/chats/${validRoomId}/messages/read`)
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          messageId: randomUUID(),
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('POST /api/v1/chats/:roomId/messages/read - rejects unauthorized room access (403)', async () => {
      // assertRoomParticipant returns a room where user is NOT a participant
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: otherRoomId,
          userOneId: 'unrelated-user-1',
          userTwoId: 'unrelated-user-2',
          wrappedRoomKey,
          roomKeyId,
        },
        error: null,
      });

      const res = await authedRequest(app)
        .post(`/api/v1/chats/${otherRoomId}/messages/read`)
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          messageId: randomUUID(),
        });

      expect(res.status).toBe(403);
    });

    it('POST /api/v1/chats/:roomId/messages/read - rejects non-UUID roomId (400)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/chats/not-a-uuid/messages/read')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          messageId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(400);
    });

    it('GET /api/v1/chats/rooms - fetches chat rooms for user (200)', async () => {
      const mockRooms = [
        {
          id: validRoomId,
          userOneId: seededUserId,
          userTwoId: matchedUserId,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: mockRooms,
        error: null,
      });

      const res = await authedRequest(app)
        .get('/api/v1/chats/rooms')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.rooms).toBeDefined();
    });

    it('GET /api/v1/chats/:roomId/messages - fetches messages after verifying room participation (200)', async () => {
      // 1st single() resolves assertRoomParticipant
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: validRoomId,
          userOneId: seededUserId,
          userTwoId: matchedUserId,
          wrappedRoomKey,
          roomKeyId,
        },
        error: null,
      });
      const messageId = randomUUID();
      const encryptedContent = chatCryptoService.encryptMessage(
        'decrypted test message',
        rawKey,
      );
      const mockDbMessage = {
        id: messageId,
        roomId: validRoomId,
        senderId: matchedUserId,
        content: encryptedContent,
        createdAt: '2023-01-01T00:00:00.000Z',
        readAt: null,
      };
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [mockDbMessage],
        error: null,
      });

      const res = await authedRequest(app)
        .get(`/api/v1/chats/${validRoomId}/messages?limit=10`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0]).toMatchObject({
        id: messageId,
        roomId: validRoomId,
        senderId: matchedUserId,
        content: 'decrypted test message',
      });
    });

    it('GET /api/v1/chats/:roomId/key - retrieves unwrapped room encryption key (200)', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: validRoomId,
          userOneId: seededUserId,
          userTwoId: matchedUserId,
          wrappedRoomKey,
          roomKeyId,
        },
        error: null,
      });

      const res = await authedRequest(app)
        .get(`/api/v1/chats/${validRoomId}/key`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.roomId).toBe(validRoomId);
      expect(res.body.key).toBe(rawKey.toString('base64'));
      expect(res.body.algorithm).toBe('AES-GCM-256');
    });

    it('GET /api/v1/chats/:roomId/key - rejects non-UUID roomId (400)', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/chats/not-a-uuid/key')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(400);
    });

    it('DELETE /api/v1/chats/:roomId/messages - deletes messages sent by the user (200)', async () => {
      const messageId = randomUUID();
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: validRoomId,
          userOneId: seededUserId,
          userTwoId: matchedUserId,
          wrappedRoomKey,
          roomKeyId,
        },
        error: null,
      });
      // fetchAndValidateMessagesForDeletion
      mockSupabaseClient.in.mockResolvedValueOnce({
        data: [{ id: messageId, senderId: seededUserId }],
        error: null,
      });
      // executeMessageDeletion
      mockSupabaseClient.in.mockResolvedValueOnce({
        count: 1,
        error: null,
      });

      const res = await authedRequest(app)
        .delete(`/api/v1/chats/${validRoomId}/messages`)
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          messageIds: [messageId],
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, deletedCount: 1 });
    });

    it('GET /api/v1/chats/rooms - rejects unauthenticated request (401)', async () => {
      const res = await authedRequest(app).get('/api/v1/chats/rooms');
      expect(res.status).toBe(401);
    });
  });
});
