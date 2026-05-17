import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

export type MockPrismaService = DeepMockProxy<PrismaClient>;
export const createPrismaMock = () => mockDeep<PrismaClient>();
