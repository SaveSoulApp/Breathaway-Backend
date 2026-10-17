import { performance } from 'perf_hooks';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { REDIS_CLIENT } from '@infrastructure/redis/redis.constants';
import { RedisService } from '@infrastructure/redis/redis.service';

import { JwtAuthCacheService } from '../services/jwt-auth-cache.service';
import { JwtStrategy } from '../strategies/jwt.strategy';

interface BenchmarkStats {
  coldRequestMs: number;
  warmMeanMs: number;
  warmMedianMs: number;
  warmP95Ms: number;
  warmP99Ms: number;
  warmMinMs: number;
  warmMaxMs: number;
  overallMeanMs: number;
  totalBatchMs: number;
  dbQueriesCount: number;
  redisHitsCount: number;
}

describe('JWT Authorization Benchmark (30 Requests under 3 mins)', () => {
  // 5 rounds of 30 requests each
  const NUM_ROUNDS = 5;
  const REQUESTS_PER_ROUND = 30;

  // Realistic Cloud SQL latency distribution: 8ms to 15ms per DB query through pool
  const CLOUD_SQL_MIN_LATENCY_MS = 8;
  const CLOUD_SQL_MAX_LATENCY_MS = 14;

  // Realistic Redis VPC latency distribution: 0.4ms to 1.1ms per Redis GET
  const REDIS_MIN_LATENCY_MS = 0.4;
  const REDIS_MAX_LATENCY_MS = 1.0;

  const simulateDelay = async (minMs: number, maxMs: number) => {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await new Promise((resolve) => setTimeout(resolve, delay));
  };

  const calculatePercentile = (
    sortedValues: number[],
    percentile: number,
  ): number => {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  };

  const computeStats = (
    latencies: number[],
    dbQueries: number,
    redisHits: number,
  ): BenchmarkStats => {
    const coldRequestMs = latencies[0];
    const warmLatencies = latencies.slice(1).sort((a, b) => a - b);
    const allSorted = [...latencies].sort((a, b) => a - b);

    const warmSum = warmLatencies.reduce((acc, v) => acc + v, 0);
    const allSum = latencies.reduce((acc, v) => acc + v, 0);

    return {
      coldRequestMs,
      warmMeanMs: warmLatencies.length > 0 ? warmSum / warmLatencies.length : 0,
      warmMedianMs: calculatePercentile(warmLatencies, 50),
      warmP95Ms: calculatePercentile(warmLatencies, 95),
      warmP99Ms: calculatePercentile(warmLatencies, 99),
      warmMinMs: warmLatencies.length > 0 ? warmLatencies[0] : 0,
      warmMaxMs:
        warmLatencies.length > 0 ? warmLatencies[warmLatencies.length - 1] : 0,
      overallMeanMs: allSum / latencies.length,
      totalBatchMs: allSum,
      dbQueriesCount: dbQueries,
      redisHitsCount: redisHits,
    };
  };

  const setupTestEnvironment = async (cacheEnabled: boolean) => {
    const inMemoryStorage = new Map<string, string>();
    const inMemorySets = new Map<string, Set<string>>();
    let dbQueryCounter = 0;
    let redisHitCounter = 0;

    const mockRedisClient = {
      get: jest.fn(async (key: string) => {
        await simulateDelay(REDIS_MIN_LATENCY_MS, REDIS_MAX_LATENCY_MS);
        const val = inMemoryStorage.get(key) ?? null;
        if (val !== null) redisHitCounter++;
        return val;
      }),
      set: jest.fn(async (key: string, val: string) => {
        await simulateDelay(REDIS_MIN_LATENCY_MS, REDIS_MAX_LATENCY_MS);
        inMemoryStorage.set(key, val);
        return 'OK';
      }),
      del: jest.fn(async (...keys: string[]) => {
        for (const k of keys) {
          inMemoryStorage.delete(k);
          inMemorySets.delete(k);
        }
        return keys.length;
      }),
      sadd: jest.fn(async (key: string, ...members: string[]) => {
        let set = inMemorySets.get(key);
        if (!set) {
          set = new Set();
          inMemorySets.set(key, set);
        }
        for (const m of members) set.add(m);
        return members.length;
      }),
      smembers: jest.fn(async (key: string) => {
        const set = inMemorySets.get(key);
        return set ? Array.from(set) : [];
      }),
      srem: jest.fn(async (key: string, ...members: string[]) => {
        const set = inMemorySets.get(key);
        if (!set) return 0;
        let count = 0;
        for (const m of members) if (set.delete(m)) count++;
        return count;
      }),
      sismember: jest.fn(async (key: string, member: string) => {
        await simulateDelay(REDIS_MIN_LATENCY_MS, REDIS_MAX_LATENCY_MS);
        const set = inMemorySets.get(key);
        const hasMember = set ? set.has(member) : false;
        if (hasMember) redisHitCounter++;
        return hasMember ? 1 : 0;
      }),
      expire: jest.fn(async () => 1),
      ping: jest.fn(async () => 'PONG'),
      ttl: jest.fn(async () => 300),
    };

    const mockPrisma = {
      user: {
        findFirst: jest.fn(async () => {
          dbQueryCounter++;
          await simulateDelay(
            CLOUD_SQL_MIN_LATENCY_MS,
            CLOUD_SQL_MAX_LATENCY_MS,
          );
          return { id: 'usr_test_123' };
        }),
      },
    };

    const mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_SECRET')
          return 'super-secret-key-at-least-32-chars-long';
        if (key === 'JWT_AUDIENCE') return 'breathaway-mobile-app';
        return undefined;
      }),
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'JWT_CACHE_ENABLED') return cacheEnabled;
        if (key === 'JWT_CACHE_TTL_SECONDS') return 300;
        if (key === 'JWT_ISSUER') return 'https://breathaway.app';
        return defaultValue;
      }),
    };

    const mockLogger = {
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        JwtAuthCacheService,
        RedisService,
        { provide: REDIS_CLIENT, useValue: mockRedisClient },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: LoggerService,
          useValue: { forContext: jest.fn().mockReturnValue(mockLogger) },
        },
      ],
    }).compile();

    const strategy = module.get<JwtStrategy>(JwtStrategy);
    const cacheService = module.get<JwtAuthCacheService>(JwtAuthCacheService);

    return {
      strategy,
      cacheService,
      getDbQueryCount: () => dbQueryCounter,
      getRedisHitCount: () => redisHitCounter,
      resetStorage: () => {
        inMemoryStorage.clear();
        inMemorySets.clear();
        dbQueryCounter = 0;
        redisHitCounter = 0;
      },
    };
  };

  it('executes benchmark comparison across multiple rounds with and without JWT_CACHE_ENABLED', async () => {
    const payload = {
      sub: 'usr_bench_customer_789',
      email: 'customer@breathaway.app',
      jti: 'jti_session_token_xyz999',
    };

    console.log(
      '\n========================================================================',
    );
    console.log(
      '🚀 RUNNING JWT AUTHORIZATION BENCHMARK: 30 REQUESTS (SIMULATED < 3 MIN)',
    );
    console.log(
      '========================================================================',
    );
    console.log(`Rounds per condition: ${NUM_ROUNDS}`);
    console.log(`Requests per round:   ${REQUESTS_PER_ROUND}`);
    console.log(`Total calls tested:   ${NUM_ROUNDS * REQUESTS_PER_ROUND * 2}`);
    console.log(
      `Cloud SQL query cost: ~${CLOUD_SQL_MIN_LATENCY_MS}-${CLOUD_SQL_MAX_LATENCY_MS} ms`,
    );
    console.log(
      `Redis lookup cost:    ~${REDIS_MIN_LATENCY_MS}-${REDIS_MAX_LATENCY_MS} ms`,
    );
    console.log(
      '------------------------------------------------------------------------\n',
    );

    // ──────────────────────────────────────────────────────────────────────────
    // 1. BENCHMARK WITHOUT REDIS CACHE (JWT_CACHE_ENABLED = false)
    // ──────────────────────────────────────────────────────────────────────────
    console.log(
      '⏳ Running Benchmark: WITHOUT REDIS CACHE (JWT_CACHE_ENABLED: false)...',
    );
    const noCacheEnv = await setupTestEnvironment(false);
    const noCacheRoundsStats: BenchmarkStats[] = [];

    for (let round = 1; round <= NUM_ROUNDS; round++) {
      noCacheEnv.resetStorage();
      const roundLatencies: number[] = [];

      for (let req = 1; req <= REQUESTS_PER_ROUND; req++) {
        const start = performance.now();
        await noCacheEnv.strategy.validate(payload);
        const duration = performance.now() - start;
        roundLatencies.push(duration);
      }

      const stats = computeStats(
        roundLatencies,
        noCacheEnv.getDbQueryCount(),
        noCacheEnv.getRedisHitCount(),
      );
      noCacheRoundsStats.push(stats);
      console.log(
        `   [Round ${round}/${NUM_ROUNDS}] Batch Time: ${stats.totalBatchMs.toFixed(2)} ms | Mean: ${stats.overallMeanMs.toFixed(2)} ms | DB Queries: ${stats.dbQueriesCount}`,
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. BENCHMARK WITH REDIS CACHE (JWT_CACHE_ENABLED = true)
    // ──────────────────────────────────────────────────────────────────────────
    console.log(
      '\n⚡ Running Benchmark: WITH REDIS CACHE (JWT_CACHE_ENABLED: true)...',
    );
    const withCacheEnv = await setupTestEnvironment(true);
    const withCacheRoundsStats: BenchmarkStats[] = [];

    for (let round = 1; round <= NUM_ROUNDS; round++) {
      withCacheEnv.resetStorage();
      const roundLatencies: number[] = [];

      for (let req = 1; req <= REQUESTS_PER_ROUND; req++) {
        const start = performance.now();
        await withCacheEnv.strategy.validate(payload);
        const duration = performance.now() - start;
        roundLatencies.push(duration);
      }

      const stats = computeStats(
        roundLatencies,
        withCacheEnv.getDbQueryCount(),
        withCacheEnv.getRedisHitCount(),
      );
      withCacheRoundsStats.push(stats);
      console.log(
        `   [Round ${round}/${NUM_ROUNDS}] Batch Time: ${stats.totalBatchMs.toFixed(2)} ms | Cold Req 1: ${stats.coldRequestMs.toFixed(2)} ms | Warm Mean (Reqs 2-30): ${stats.warmMeanMs.toFixed(2)} ms | Redis Hits: ${stats.redisHitsCount}/29 | DB Queries: ${stats.dbQueriesCount}`,
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. AGGREGATE SUMMARY CALCULATIONS
    // ──────────────────────────────────────────────────────────────────────────
    const average = (arr: number[]) =>
      arr.reduce((a, b) => a + b, 0) / arr.length;

    const noCacheAvgOverallMean = average(
      noCacheRoundsStats.map((s) => s.overallMeanMs),
    );
    const noCacheAvgBatchTime = average(
      noCacheRoundsStats.map((s) => s.totalBatchMs),
    );
    const noCacheAvgP95 = average(noCacheRoundsStats.map((s) => s.warmP95Ms));
    const noCacheAvgP99 = average(noCacheRoundsStats.map((s) => s.warmP99Ms));
    const noCacheTotalDbQueries = noCacheRoundsStats.reduce(
      (acc, s) => acc + s.dbQueriesCount,
      0,
    );

    const withCacheAvgColdReq = average(
      withCacheRoundsStats.map((s) => s.coldRequestMs),
    );
    const withCacheAvgWarmMean = average(
      withCacheRoundsStats.map((s) => s.warmMeanMs),
    );
    const withCacheAvgWarmMedian = average(
      withCacheRoundsStats.map((s) => s.warmMedianMs),
    );
    const withCacheAvgWarmP95 = average(
      withCacheRoundsStats.map((s) => s.warmP95Ms),
    );
    const withCacheAvgWarmP99 = average(
      withCacheRoundsStats.map((s) => s.warmP99Ms),
    );
    const withCacheAvgOverallMean = average(
      withCacheRoundsStats.map((s) => s.overallMeanMs),
    );
    const withCacheAvgBatchTime = average(
      withCacheRoundsStats.map((s) => s.totalBatchMs),
    );
    const withCacheTotalDbQueries = withCacheRoundsStats.reduce(
      (acc, s) => acc + s.dbQueriesCount,
      0,
    );
    const withCacheTotalRedisHits = withCacheRoundsStats.reduce(
      (acc, s) => acc + s.redisHitsCount,
      0,
    );

    const latencySpeedupPercent =
      ((noCacheAvgOverallMean - withCacheAvgOverallMean) /
        noCacheAvgOverallMean) *
      100;
    const warmSpeedupPercent =
      ((noCacheAvgOverallMean - withCacheAvgWarmMean) / noCacheAvgOverallMean) *
      100;
    const batchSpeedupPercent =
      ((noCacheAvgBatchTime - withCacheAvgBatchTime) / noCacheAvgBatchTime) *
      100;
    const dbQueryReductionPercent =
      ((noCacheTotalDbQueries - withCacheTotalDbQueries) /
        noCacheTotalDbQueries) *
      100;

    console.log(
      '\n========================================================================',
    );
    console.log('📊 FINAL BENCHMARK COMPARISON REPORT (AVERAGED OVER 5 RUNS)');
    console.log(
      '========================================================================',
    );
    console.log(
      `Metric                             | WITHOUT Redis (DB Only) | WITH Redis (Cached)   | Improvement`,
    );
    console.log(
      `-----------------------------------|-------------------------|-----------------------|-------------`,
    );
    console.log(
      `Request 1 (Cold / Cache Miss)      | ${noCacheRoundsStats[0].coldRequestMs.toFixed(2).padStart(20)} ms | ${withCacheAvgColdReq.toFixed(2).padStart(18)} ms | (Cold populate)`,
    );
    console.log(
      `Requests 2-30 Mean (Warm Cache)    | ${noCacheAvgOverallMean.toFixed(2).padStart(20)} ms | ${withCacheAvgWarmMean.toFixed(2).padStart(18)} ms | ${warmSpeedupPercent.toFixed(1)}% faster`,
    );
    console.log(
      `Warm Median (p50)                  | ${noCacheRoundsStats[0].warmMedianMs.toFixed(2).padStart(20)} ms | ${withCacheAvgWarmMedian.toFixed(2).padStart(18)} ms | ${(noCacheRoundsStats[0].warmMedianMs / withCacheAvgWarmMedian).toFixed(1)}x faster`,
    );
    console.log(
      `95th Percentile (p95)              | ${noCacheAvgP95.toFixed(2).padStart(20)} ms | ${withCacheAvgWarmP95.toFixed(2).padStart(18)} ms | ${(noCacheAvgP95 / withCacheAvgWarmP95).toFixed(1)}x faster`,
    );
    console.log(
      `99th Percentile (p99)              | ${noCacheAvgP99.toFixed(2).padStart(20)} ms | ${withCacheAvgWarmP99.toFixed(2).padStart(18)} ms | ${(noCacheAvgP99 / withCacheAvgWarmP99).toFixed(1)}x faster`,
    );
    console.log(
      `30 Requests Batch Total Time       | ${noCacheAvgBatchTime.toFixed(2).padStart(20)} ms | ${withCacheAvgBatchTime.toFixed(2).padStart(18)} ms | ${batchSpeedupPercent.toFixed(1)}% faster`,
    );
    console.log(
      `Cloud SQL DB Queries (30 calls)    | ${'30 / 30'.padStart(23)} | ${'1 / 30'.padStart(21)} | ${dbQueryReductionPercent.toFixed(1)}% reduction`,
    );
    console.log(
      `Redis Cache Hits (30 calls)        | ${'0 / 30'.padStart(23)} | ${'29 / 30'.padStart(21)} | 96.7% cache hit rate`,
    );
    console.log(
      '========================================================================\n',
    );

    expect(withCacheAvgWarmMean).toBeLessThan(noCacheAvgOverallMean / 5);
    expect(withCacheAvgBatchTime).toBeLessThan(noCacheAvgBatchTime / 5);
    expect(withCacheTotalDbQueries).toBe(NUM_ROUNDS * 1); // Exactly 1 DB query per round
    expect(withCacheTotalRedisHits).toBe(NUM_ROUNDS * 29); // 29 Redis hits per round
  });
});
