import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PubSubPushRequestDto } from './dto';
import { PubSubAuthGuard } from './guards/pubsub-auth.guard';
import { PubSubRegistryService } from './pubsub-registry.service';
import {
  ApiExcludeController,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('PubSub (Internal)')
@ApiExcludeController()
@Controller({
  path: 'pubsub',
  version: ['1'],
})
@SkipClientIdentity()
@UseGuards(PubSubAuthGuard)
export class PubSubIngestionController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly registryService: PubSubRegistryService,
  ) {
    super(logger);
  }

  @Post('ingest')
  @ApiOperation({ summary: 'Ingest Pub/Sub messages (Internal)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message successfully ingested',
  })
  @HttpCode(HttpStatus.OK)
  async ingest(@Body() rawPayload: Record<string, unknown>): Promise<void> {
    const payload = rawPayload as unknown as PubSubPushRequestDto;
    this.logger.info('Incoming Pub/Sub ingest payload', { payload });

    if (!payload?.message) {
      this.logger.warn('Ignored invalid payload: missing message object');
      return;
    }

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
      let parsedData: unknown = {};

      if (data) {
        try {
          // Decode the Base64 data
          const decodedString = Buffer.from(data, 'base64').toString('utf-8');
          parsedData = JSON.parse(decodedString);
        } catch (e) {
          this.logger.error(
            `Failed to parse JSON data for message ${messageId}: ${e instanceof Error ? e.message : String(e)}`,
          );
          return;
        }
      }

      // Route to the registered handler (pure execution)
      const { target, method } = handlerContext;
      await method.call(target, parsedData, messageId);
    } catch (error) {
      this.logger.error(
        `Error processing event '${eventType}' (messageId: ${messageId}):`,
        { error: error instanceof Error ? error.message : String(error) },
      );
      // We return OK (200) or throw error based on retry strategy.
      // If we throw, Pub/Sub will retry according to the subscription's retry policy.
      throw error;
    }
  }
}
