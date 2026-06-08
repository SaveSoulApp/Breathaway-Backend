import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { IdentityWorkflowsController } from '../identity-workflows.controller';
import { LoggerService } from '@core/logger';
import { ClsService } from 'nestjs-cls';

describe('IdentityWorkflowsController', () => {
  let controller: IdentityWorkflowsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentityWorkflowsController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            forContext: jest.fn().mockReturnThis(),
          },
        },
      ],
    }).compile();

    controller = module.get<IdentityWorkflowsController>(
      IdentityWorkflowsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
