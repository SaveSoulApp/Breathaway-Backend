import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentGateway,
  TransactionChannel,
  TransactionEnvironment,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { TransactionsModule } from '@modules/transactions/transactions.module';

import {
  buildBasicAuthHeader,
  createAuthTestApp,
} from '../helpers/app-test.helper';
import {
  cleanupTestTransactions,
  cleanupTestUsers,
} from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('TransactionsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminBasicAuthHeader: string;

  const allCreatedUserIds: string[] = [];
  const allCreatedTransactionIds: string[] = [];

  let testUserId: string;
  let seededTransactionId: string;
  const gatewayTxnId = `rc_test_txn_${Date.now()}`;

  beforeAll(async () => {
    process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpass';

    const context = await createAuthTestApp([TransactionsModule]);
    app = context.app;
    prisma = context.prisma;
    const configService = app.get(ConfigService);

    adminBasicAuthHeader = buildBasicAuthHeader(
      configService.getOrThrow<string>('ADMIN_USERNAME'),
      configService.getOrThrow<string>('ADMIN_PASSWORD'),
    );

    // Seed test user
    const user = await prisma.user.create({ data: {} });
    testUserId = user.id;
    allCreatedUserIds.push(user.id);

    // Seed test transaction
    const txn = await prisma.transaction.create({
      data: {
        userId: testUserId,
        gateway: PaymentGateway.REVENUECAT,
        gatewayTransactionId: gatewayTxnId,
        type: TransactionType.PURCHASE,
        status: TransactionStatus.COMPLETED,
        environment: TransactionEnvironment.SANDBOX,
        channel: TransactionChannel.IOS,
        productId: 'likes_10',
        currency: 'USD',
        amount: 4.99,
        occurredAt: new Date(),
      },
    });
    seededTransactionId = txn.id;
    allCreatedTransactionIds.push(txn.id);
  });

  afterAll(async () => {
    await cleanupTestTransactions(prisma, allCreatedTransactionIds);
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Admin Basic Auth Guard', () => {
    it('rejects unauthenticated requests without Basic Auth (401)', async () => {
      // Act
      const res = await authedRequest(app).get('/api/v1/admin/transactions');

      // Assert
      expect(res.status).toBe(401);
    });

    it('rejects requests with invalid Basic Auth credentials (401)', async () => {
      // Arrange
      const invalidAuth = buildBasicAuthHeader('baduser', 'badpass');

      // Act
      const res = await authedRequest(app)
        .get('/api/v1/admin/transactions')
        .set('authorization', invalidAuth);

      // Assert
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/admin/transactions', () => {
    it('returns paginated transactions with valid basic auth (200)', async () => {
      // Act
      const res = await authedRequest(app)
        .get('/api/v1/admin/transactions')
        .set('authorization', adminBasicAuthHeader);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);

      const found = res.body.data.find(
        (t: any) => t.id === seededTransactionId,
      );
      expect(found).toBeDefined();
      expect(found.gatewayTransactionId).toBe(gatewayTxnId);
      expect(found.status).toBe(TransactionStatus.COMPLETED);
    });

    it('filters transactions by query parameters (200)', async () => {
      // Act
      const res = await authedRequest(app)
        .get(
          `/api/v1/admin/transactions?gateway=REVENUECAT&status=COMPLETED&limit=10&page=1`,
        )
        .set('authorization', adminBasicAuthHeader);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const found = res.body.data.find(
        (t: any) => t.id === seededTransactionId,
      );
      expect(found).toBeDefined();
    });

    it('rejects invalid query parameters (400)', async () => {
      // Act
      const res = await authedRequest(app)
        .get(`/api/v1/admin/transactions?page=0&limit=999`)
        .set('authorization', adminBasicAuthHeader);

      // Assert
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/admin/transactions/:id', () => {
    it('retrieves single transaction by ID (200)', async () => {
      // Act
      const res = await authedRequest(app)
        .get(`/api/v1/admin/transactions/${seededTransactionId}`)
        .set('authorization', adminBasicAuthHeader);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(seededTransactionId);
      expect(res.body.gatewayTransactionId).toBe(gatewayTxnId);
      expect(res.body.amount).toBe(4.99);
      expect(res.body.currency).toBe('USD');
    });

    it('returns 404 for non-existent transaction ID', async () => {
      // Act
      const res = await authedRequest(app)
        .get('/api/v1/admin/transactions/01H1V1ABCD2EF3GH4JK5LM6NP7')
        .set('authorization', adminBasicAuthHeader);

      // Assert
      expect(res.status).toBe(404);
    });
  });
});
