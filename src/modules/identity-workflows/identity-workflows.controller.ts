import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

@ApiTags('Identity Workflows')
@Controller({
  path: 'identity-workflows',
  version: ['1'],
})
/**
 * Handles HTTP operations for the /identity-workflows resource.
 *
 * Currently acts as a mounting point for the identity-workflows domain; route
 * handlers for manual identity management operations will be added here as the
 * feature evolves. Core identity-linking logic is driven by Pub/Sub events in
 * IdentityWorkflowsService.
 */
export class IdentityWorkflowsController extends BaseController {
  constructor(logger: LoggerService) {
    super(logger);
  }
}
