import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { MetaWebhookDto } from './dto';
import { MetaWebhookIntent } from './enums/meta-webhook-intent.enum';
import { MetaWebhookResult } from './interfaces/meta-webhook-result.interface';
import { determineIntent, extractMessages } from './utils/meta-webhook.parser';
import { OtpService } from '../one-time-passwords/one-time-passwords.service';
import { SocialidentityService } from '../social-identities/social-identities.service';
import { IdentityService } from '../identities/identities.service';
import { IdentityType } from '@prisma/client';

@Injectable()
export class WebhooksService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly socialidentityService: SocialidentityService,
    private readonly identityService: IdentityService,
  ) {
    super(logger);
  }

  verifyMetaWebhook(
    mode: string,
    token: string,
    challenge: string,
  ): Promise<string> {
    const VERIFY_TOKEN = this.configService.get<string>('META_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      this.logger.log('Meta webhook verified successfully');
      return Promise.resolve(challenge); // MUST return raw string
    }

    this.logger.warn('Meta webhook verification failed');
    return Promise.resolve('Verification failed');
  }

  /**
   * Parses an incoming Meta webhook payload, determines its intent,
   * and extracts relevant information.
   *
   * @param payload - The validated Meta webhook DTO
   * @returns An array of parsed webhook results (one per entry)
   */
  parseMetaWebhook(payload: MetaWebhookDto): MetaWebhookResult[] {
    const results: MetaWebhookResult[] = [];

    for (const entry of payload.entry) {
      const intent = determineIntent(entry);
      const messages =
        intent === MetaWebhookIntent.MESSAGE ? extractMessages(entry) : [];

      results.push({
        intent,
        platform: payload.object,
        entryId: entry.id,
        messages,
      });
    }

    return results;
  }

  /**
   * Handles the parsed webhook results by routing each intent
   * to the appropriate handler.
   *
   * @param results - Array of parsed webhook results
   */
  async handleMetaWebhookEvents(results: MetaWebhookResult[]): Promise<void> {
    for (const result of results) {
      switch (result.intent) {
        case MetaWebhookIntent.MESSAGE:
          await this.handleMessageIntent(result);
          break;

        case MetaWebhookIntent.UNKNOWN:
        default:
          this.logger.warn('Unhandled webhook intent', {
            intent: result.intent,
            entryId: result.entryId,
          });
          break;
      }
    }
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * Handles MESSAGE intent events.
   * Extend this method with your business logic (e.g., store in DB,
   * trigger auto-replies, forward to AI, etc.)
   */
  private async handleMessageIntent(result: MetaWebhookResult): Promise<void> {
    for (const message of result.messages) {
      this.logger.log('Instagram message received', {
        senderId: message.senderId,
        recipientId: message.recipientId,
        messageId: message.messageId,
        text: message.text,
        timestamp: new Date(message.timestamp).toISOString(),
      });

      // Check if message is a Verify OTP request
      const verifyRegex = /^verify:\s*(\S+)/i;
      const match = message.text.match(verifyRegex);

      if (match && match[1]) {
        const extractedOtp = match[1];

        try {
          this.logger.log(`OTP extracted: ${extractedOtp}. Verifying...`);
          // Note: verifyAndConsumeOtp automatically handles hashing the OTP
          const userId =
            await this.otpService.verifyAndConsumeOtp(extractedOtp);

          this.logger.log(
            `OTP verified successfully for userId: ${userId}. Fetching identity for senderId: ${message.senderId}`,
          );
          const identity =
            await this.socialidentityService.verifyInstagramIdentity(
              message.senderId,
            );

          const username = identity.username;

          if (username) {
            this.logger.log(
              `Found Instagram username: ${username}. Linking identity to user ${userId}...`,
            );
            await this.identityService.claimOrCreateIdentity(
              IdentityType.INSTAGRAM,
              username,
              message.senderId,
              userId,
            );
            this.logger.log(
              `Successfully linked Instagram identity (${username}) to user (${userId}).`,
            );
            // TODO: take the next steps
          } else {
            this.logger.warn(
              `Could not extract a valid username from Instagram identity payload.`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error during OTP verification flow for sender ${message.senderId}: ${(error as Error).message}`,
          );
        }
      }
    }
  }
}
