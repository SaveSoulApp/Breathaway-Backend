import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private static instance: PrismaClient | null = null;
  private pool: Pool | null = null;

  constructor(configService: ConfigService) {
    if (PrismaService.instance) {
      return PrismaService.instance as PrismaService;
    }

    // Use DIRECT_URL for migrations, DATABASE_URL for application
    const databaseUrl =
      configService.get('OPERATION_MODE') === 'migration'
        ? configService.get('DIRECT_URL')
        : configService.get('DATABASE_URL');

    const pool = new Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);

    super({
      adapter,
    });

    this.pool = pool;
    PrismaService.instance = this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (this.pool) {
      await this.pool.end();
    }
    PrismaService.instance = null;
  }
}
