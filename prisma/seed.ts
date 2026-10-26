import { PrismaPg } from '@prisma/adapter-pg';
import {
  CurrencyCode,
  PaymentGateway,
  PrismaClient,
  SubscriptionPlanStatus,
  SubscriptionPriceChangeType,
} from '@prisma/client';
import { Pool } from 'pg';

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(
    'Error: DATABASE_URL or DIRECT_URL environment variable is not set.',
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Seeds canonical subscription plans (Gold, Silver, Basic).
 */
async function seedSubscriptionPlans(client: PrismaClient): Promise<void> {
  console.log('Seeding subscription plans...');

  const plans = [
    {
      id: '01KW634Z750QRX94MZ177P6YCS',
      name: 'Gold Plan',
      description:
        'Unlock premium features, get priority matching, and receive 10 credits.',
      slug: 'likes-10',
      appleProductId: 'likes_10',
      googleProductId: 'likes_10',
      creditsGranted: 10,
      validityDays: 90,
      trialDurationDays: 0,
      sortOrder: 3,
      status: SubscriptionPlanStatus.ACTIVE,
    },
    {
      id: '01KW6377SZDJF91CP0K5VW18ZQ',
      name: 'Silver Plan',
      description:
        'Unlock basic features, get priority matching, and receive 5 credits.',
      slug: 'likes-5',
      appleProductId: 'likes_5',
      googleProductId: 'likes_5',
      creditsGranted: 5,
      validityDays: 60,
      trialDurationDays: 0,
      sortOrder: 2,
      status: SubscriptionPlanStatus.ACTIVE,
    },
    {
      id: '01KW638HZCKY5W9578JX78PFDX',
      name: 'Basic Plan',
      description: 'Single like and 1 credits.',
      slug: 'likes-1',
      appleProductId: 'likes_1',
      googleProductId: 'likes_1',
      creditsGranted: 1,
      validityDays: 30,
      trialDurationDays: 0,
      sortOrder: 1,
      status: SubscriptionPlanStatus.ACTIVE,
    },
  ];

  for (const plan of plans) {
    await client.subscriptionPlan.upsert({
      where: { id: plan.id },
      update: {
        name: plan.name,
        description: plan.description,
        slug: plan.slug,
        appleProductId: plan.appleProductId,
        googleProductId: plan.googleProductId,
        creditsGranted: plan.creditsGranted,
        validityDays: plan.validityDays,
        trialDurationDays: plan.trialDurationDays,
        sortOrder: plan.sortOrder,
        status: plan.status,
      },
      create: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        slug: plan.slug,
        appleProductId: plan.appleProductId,
        googleProductId: plan.googleProductId,
        creditsGranted: plan.creditsGranted,
        validityDays: plan.validityDays,
        trialDurationDays: plan.trialDurationDays,
        sortOrder: plan.sortOrder,
        status: plan.status,
      },
    });
  }

  console.log(`Seeded ${plans.length} subscription plans successfully.`);
}

/**
 * Seeds plan prices and records their initial audit trail in SubscriptionPlanPriceHistory.
 */
async function seedSubscriptionPlanPrices(client: PrismaClient): Promise<void> {
  console.log('Seeding subscription plan prices and audit history...');

  const prices = [
    {
      id: '01M4NH7YBGKBBBD3AHEGR227SJ',
      planId: '01KW638HZCKY5W9578JX78PFDX',
      currencyCode: CurrencyCode.INR,
      countryCode: 'IN',
      originalPrice: 299.0,
      discountedPrice: null,
      discountStartsAt: null,
      discountEndsAt: null,
    },
    {
      id: '01M4NHACZJJGQFGHFZYDBSB0VX',
      planId: '01KW6377SZDJF91CP0K5VW18ZQ',
      currencyCode: CurrencyCode.INR,
      countryCode: 'IN',
      originalPrice: 1299.0,
      discountedPrice: null,
      discountStartsAt: null,
      discountEndsAt: null,
    },
    {
      id: '01M4NHAQCGH2TGD2GYT5YJVS4Q',
      planId: '01KW634Z750QRX94MZ177P6YCS',
      currencyCode: CurrencyCode.INR,
      countryCode: 'IN',
      originalPrice: 2499.0,
      discountedPrice: null,
      discountStartsAt: null,
      discountEndsAt: null,
    },
  ];

  for (const price of prices) {
    const savedPrice = await client.subscriptionPlanPrice.upsert({
      where: {
        planId_currencyCode_countryCode: {
          planId: price.planId,
          currencyCode: price.currencyCode,
          countryCode: price.countryCode,
        },
      },
      update: {
        originalPrice: price.originalPrice,
        discountedPrice: price.discountedPrice,
        discountStartsAt: price.discountStartsAt,
        discountEndsAt: price.discountEndsAt,
      },
      create: {
        id: price.id,
        planId: price.planId,
        currencyCode: price.currencyCode,
        countryCode: price.countryCode,
        originalPrice: price.originalPrice,
        discountedPrice: price.discountedPrice,
        discountStartsAt: price.discountStartsAt,
        discountEndsAt: price.discountEndsAt,
      },
    });

    const existingHistory = await client.subscriptionPlanPriceHistory.findFirst(
      {
        where: {
          priceId: savedPrice.id,
          changeType: SubscriptionPriceChangeType.INITIAL_PRICE,
        },
      },
    );

    if (!existingHistory) {
      await client.subscriptionPlanPriceHistory.create({
        data: {
          priceId: savedPrice.id,
          planId: savedPrice.planId,
          countryCode: savedPrice.countryCode,
          currencyCode: savedPrice.currencyCode,
          originalPrice: savedPrice.originalPrice,
          discountedPrice: savedPrice.discountedPrice,
          discountStartsAt: savedPrice.discountStartsAt,
          discountEndsAt: savedPrice.discountEndsAt,
          effectiveFrom: new Date(),
          effectiveTo: null,
          changeType: SubscriptionPriceChangeType.INITIAL_PRICE,
          changedByUserId: 'SYSTEM_SEED',
          changeReason: 'Initial baseline price seed',
        },
      });
    }
  }

  console.log(
    `Seeded ${prices.length} subscription plan prices and corresponding history logs successfully.`,
  );
}

/**
 * Seeds country-specific payment gateway routing rules.
 */
async function seedPaymentGatewayRoutes(client: PrismaClient): Promise<void> {
  console.log('Seeding payment gateway routes...');

  const routes = [
    {
      id: '01M3GWS6W10GF61FAM7ASZ4B6Z',
      countryCode: 'IN',
      gateway: PaymentGateway.RAZORPAY,
      priority: 1,
      enabled: true,
      minAmount: null,
      maxAmount: null,
    },
    {
      id: '01M3J1E4AZPZ6AJ7SA598EXMAD',
      countryCode: 'IN',
      gateway: PaymentGateway.CASHFREE,
      priority: 2,
      enabled: true,
      minAmount: null,
      maxAmount: null,
    },
  ];

  for (const route of routes) {
    await client.paymentGatewayRoute.upsert({
      where: {
        countryCode_gateway: {
          countryCode: route.countryCode,
          gateway: route.gateway,
        },
      },
      update: {
        priority: route.priority,
        enabled: route.enabled,
        minAmount: route.minAmount,
        maxAmount: route.maxAmount,
      },
      create: {
        id: route.id,
        countryCode: route.countryCode,
        gateway: route.gateway,
        priority: route.priority,
        enabled: route.enabled,
        minAmount: route.minAmount,
        maxAmount: route.maxAmount,
      },
    });
  }

  console.log(`Seeded ${routes.length} payment gateway routes successfully.`);
}

async function main(): Promise<void> {
  console.log('Starting database seeding...');
  await seedSubscriptionPlans(prisma);
  await seedSubscriptionPlanPrices(prisma);
  await seedPaymentGatewayRoutes(prisma);
  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
