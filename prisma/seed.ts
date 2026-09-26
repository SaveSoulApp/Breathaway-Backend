import { PaymentGateway, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding payment gateway routes...');

  await prisma.paymentGatewayRoute.upsert({
    where: {
      countryCode_gateway: {
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
      },
    },
    update: {
      enabled: true,
      priority: 1,
    },
    create: {
      countryCode: 'IN',
      gateway: PaymentGateway.RAZORPAY,
      priority: 1,
      enabled: true,
    },
  });

  console.log('Payment gateway routes seeded successfully.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
