import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

@ApiTags('Identity Workflows')
@Controller({
  path: 'identity-workflows',
  version: ['1'],
})
export class IdentityWorkflowsController extends BaseController {
  constructor(logger: LoggerService) {
    super(logger);
  }
}
