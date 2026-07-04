import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeController,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiStandardErrors } from '@common/decorators';
import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { serializeError } from '@common/utils/error.utils';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import { PubSubPushRequestDto } from './dto';
import { PubSubAuthGuard } from './guards/pubsub-auth.guard';
import { PubSubRegistryService } from './pubsub-registry.service';

@ApiTags('PubSub (Internal)')
@ApiExcludeController()
@ApiStandardErrors()
@Controller({
  path: 'pubsub',
  version: ['1'],
})
@SkipClientIdentity()
@UseGuards(PubSubAuthGuard)
/**
 * Internal HTTP endpoint that receives GCP Pub/Sub push-delivery messages and
 * dispatches them to registered @PubSubListener handlers.
 *
 * Excluded from the public Swagger docs and protected by a shared-secret token
 * guard (PubSubAuthGuard). All routes skip the standard client-identity check
 * because Pub/Sub push requests originate from Google's infrastructure, not
 * from app clients.
 */
export class PubSubIngestionController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly registryService: PubSubRegistryService,
  ) {
    super(logger);
  }

  /**
   * Accepts a raw GCP Pub/Sub push payload, resolves the target handler by
   * `eventType` attribute, decodes the Base64 message body, and invokes the
   * matched @PubSubListener method.
   *
   * Invalid or unroutable messages (missing `message` object, missing
   * `eventType`, no registered handler, or unparseable Base64 data) are
   * silently swallowed with a warning log and a 200 OK response — returning
   * a non-2xx would cause Pub/Sub to retry indefinitely for unroutable events.
   * Errors thrown during handler execution propagate and trigger Pub/Sub's
   * retry policy according to the subscription configuration.
   *
   * @param rawPayload - The raw push notification body from GCP Pub/Sub.
   */
  @Post('ingest')
  @ApiOperation({ summary: 'Ingest Pub/Sub messages (Internal)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message successfully ingested',
  })
  @HttpCode(HttpStatus.OK)
  async ingest(@Body() rawPayload: Record<string, unknown>): Promise<void> {
    const payload = rawPayload as unknown as PubSubPushRequestDto;

    // Do NOT log the full payload wholesale (PII safety). Log the metadata instead.
    this.logger.info('Incoming Pub/Sub ingest payload', {
      messageId: payload?.message?.messageId,
      eventType: payload?.message?.attributes?.eventType,
      step: 'init',
    });

    if (!payload?.message) {
      this.logger.warn('Ignored invalid payload: missing message object', {
        step: 'ingest_check',
      });
      return;
    }

    const { message } = payload;
    const { data, messageId, attributes } = message;
    const eventType = attributes?.eventType;

    const ctx = { messageId, eventType };

    if (!eventType) {
      this.logger.warn("Ignored message: Missing 'eventType' attribute", {
        ...ctx,
        step: 'ingest_check',
      });
      return;
    }

    const handlerContext = this.registryService.getHandler(eventType);
    if (!handlerContext) {
      this.logger.warn('Ignored message: No handler registered for eventType', {
        ...ctx,
        step: 'routing_check',
      });
      return;
    }

    try {
      let parsedData: unknown = {};

      if (data) {
        try {
          // Decode the Base64 data
          const decodedString = Buffer.from(data, 'base64').toString('utf-8');
          parsedData = JSON.parse(decodedString);
        } catch (e) {
          this.logger.error('Failed to parse JSON data for message', {
            ...ctx,
            step: 'decode_payload',
            err: serializeError(e),
          });
          return;
        }
      }

      // Route to the registered handler (pure execution)
      const { target, method } = handlerContext;
      await method.call(target, parsedData, messageId);
    } catch (error) {
      this.logger.error('Error processing event', {
        ...ctx,
        step: 'execute_handler',
        err: serializeError(error),
      });
      throw error;
    }
  }
}
