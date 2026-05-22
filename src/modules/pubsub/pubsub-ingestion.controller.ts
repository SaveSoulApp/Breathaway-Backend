import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PubSubPushRequestDto } from './dto';
import { PubSubRegistryService } from './pubsub-registry.service';

@Controller({
  path: 'pubsub',
  version: ['1'],
})
export class PubSubIngestionController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly registryService: PubSubRegistryService,
  ) {
    super(logger);
  }

  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  async ingest(@Body() payload: PubSubPushRequestDto): Promise<void> {
    this.logger.info('Incoming Pub/Sub ingest payload', { payload });
    const { message } = payload;
    const { data, messageId, attributes } = message;

    // The Pub/Sub eventType must be passed in the attributes map when publishing
    const eventType = attributes?.eventType;
    if (!eventType) {
      this.logger.warn(
        `Ignored message ${messageId}: Missing 'eventType' attribute.`,
      );
      return;
    }

    const handlerContext = this.registryService.getHandler(eventType);
    if (!handlerContext) {
      this.logger.warn(
        `Ignored message ${messageId}: No handler registered for eventType '${eventType}'.`,
      );
      return;
    }

    // [TODO] Idempotency Guard (Redis)
    // Here you would check if messageId exists in Redis. If yes, return early.
    // If no, set messageId in Redis with a TTL. Example:
    // const isDuplicate = await this.redisService.setnx(`pubsub:processed:${messageId}`, '1');
    // if (!isDuplicate) { return; }
    // await this.redisService.expire(`pubsub:processed:${messageId}`, 86400); // 1 day

    try {
      // Decode the Base64 data
      const decodedString = Buffer.from(data, 'base64').toString('utf-8');
      let parsedData: unknown;

      try {
        parsedData = JSON.parse(decodedString);
      } catch (e) {
        this.logger.error(
          `Failed to parse JSON data for message ${messageId}: ${e instanceof Error ? e.message : String(e)}`,
        );
        return;
      }

      // Route to the registered handler (pure execution)
      const { target, method } = handlerContext;
      await method.call(target, parsedData, messageId);
    } catch (error) {
      this.logger.error(
        `Error processing event '${eventType}' (messageId: ${messageId}):`,
        error,
      );
      // We return OK (200) or throw error based on retry strategy.
      // If we throw, Pub/Sub will retry according to the subscription's retry policy.
      throw error;
    }
  }
}
