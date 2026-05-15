import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoggerService } from '@core/logger/logger.service';
import { InstagramService } from './instagram.service';

@Injectable()
export class InstagramScheduler {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly logger: LoggerService,
  ) {}

  // Instagram long-lived tokens expire after 60 days.
  // Refresh every 50 days to stay well within the window.
  // Cron: at 00:00 on day-of-month 1 of every ~7th week (approximated via interval days).
  // Using a custom cron: "0 0 */50 * *" — midnight every 50 days.
  @Cron('0 0 */50 * *', { name: 'instagram-token-refresh' })
  async handleTokenRefresh() {
    //Currently disbaled
    return;
    this.logger.log('Scheduled Instagram token refresh triggered');
    try {
      const result = await this.instagramService.refreshSystemAccessToken();
      this.logger.log(
        `Scheduled Instagram token refresh succeeded. New token expires in ${result?.expires_in ?? 'unknown'} seconds`,
      );
    } catch (error) {
      this.logger.error(
        `Scheduled Instagram token refresh failed: ${error.message}`,
      );
    }
  }
}
