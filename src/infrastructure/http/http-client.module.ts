import { Global, Module } from '@nestjs/common';

import { HttpClientService } from './http-client.service';

/**
 * Global infrastructure module providing HttpClientService across all feature modules.
 */
@Global()
@Module({
  providers: [HttpClientService],
  exports: [HttpClientService],
})
export class HttpClientModule {}
