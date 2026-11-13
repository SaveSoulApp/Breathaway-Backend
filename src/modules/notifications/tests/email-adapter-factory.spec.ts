import { Test, TestingModule } from '@nestjs/testing';

import { EMAIL_ADAPTER_TOKEN } from '../email/adapters/email-adapter.interface';
import { FailoverEmailAdapter } from '../email/adapters/failover.email.adapter';

describe('Email Adapter Module Provider', () => {
  it('should alias EMAIL_ADAPTER_TOKEN to FailoverEmailAdapter instance', async () => {
    const mockFailoverAdapter = { name: 'failover-adapter', send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: FailoverEmailAdapter, useValue: mockFailoverAdapter },
        {
          provide: EMAIL_ADAPTER_TOKEN,
          useExisting: FailoverEmailAdapter,
        },
      ],
    }).compile();

    const resolved = module.get(EMAIL_ADAPTER_TOKEN);
    expect(resolved).toBe(mockFailoverAdapter);
  });
});
