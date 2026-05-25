import { Test, TestingModule } from '@nestjs/testing';
import { IdentityWorkflowsController } from '../identity-workflows.controller';

describe('IdentityWorkflowsController', () => {
  let controller: IdentityWorkflowsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentityWorkflowsController],
    }).compile();

    controller = module.get<IdentityWorkflowsController>(
      IdentityWorkflowsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
