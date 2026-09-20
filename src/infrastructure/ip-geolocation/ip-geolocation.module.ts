import { Module } from '@nestjs/common';

import { IpGeolocationService } from './ip-geolocation.service';

/**
 * Infrastructure module encapsulating IP geolocation capabilities.
 *
 * Provides IP-to-country lookup via IPinfo Lite for services requiring
 * geographic signals (such as regional subscription pricing).
 */
@Module({
  providers: [IpGeolocationService],
  exports: [IpGeolocationService],
})
export class IpGeolocationModule {}
