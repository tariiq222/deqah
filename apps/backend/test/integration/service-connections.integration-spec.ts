import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../src/infrastructure/cache/redis.service';
import Redis from 'ioredis';

describe('Service Connections (integration)', () => {
  let redisService: RedisService;
  let redisClient: Redis;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                REDIS_HOST: process.env.REDIS_HOST ?? 'localhost',
                REDIS_PORT: process.env.REDIS_PORT ?? '6379',
              };
              return map[key];
            },
          },
        },
      ],
    }).compile();

    redisService = module.get<RedisService>(RedisService);
    redisClient = redisService.getClient();
  });

  describe('Redis connection', () => {
    it('establishes connection to Redis', async () => {
      const isConnected = await redisClient.ping();
      expect(isConnected).toBe('PONG');
    });

    it('sets and retrieves a value', async () => {
      const testKey = `integration:test:${Date.now()}:${Math.random()}`;
      await redisClient.set(testKey, 'test-value', 'EX', 60);
      const value = await redisClient.get(testKey);
      expect(value).toBe('test-value');
      await redisClient.del(testKey);
    });
  });
});