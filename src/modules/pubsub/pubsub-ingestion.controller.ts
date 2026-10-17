import { randomUUID } from 'crypto';

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
import { GcpOidcAuthGuard } from '@common/guards';
import { serializeError } from '@common/utils/error.utils';
import { BaseController } from '@core/base';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { ClsService } from 'nestjs-cls';

import { PubSubPushRequestDto } from './dto';
import { PubSubRegistryService } from './pubsub-registry.service';

@ApiTags('PubSub (Internal)')
@ApiExcludeController()
@ApiStandardErrors()
@Controller({
  path: 'pubsub',
  version: ['1'],
})
@SkipClientIdentity()
@UseGuards(GcpOidcAuthGuard)
/**
 * Internal HTTP endpoint that receives GCP Pub/Sub push-delivery messages and
 * dispatches them to registered @PubSubListener handlers.
 *
 * Excluded from the public Swagger docs and protected by GcpOidcAuthGuard, which
 * validates Google-signed OIDC ID tokens passed in the Authorization header.
 * All routes skip the standard client-identity check because Pub/Sub push requests
 * originate from Google infrastructure, not app clients.
 */
export class PubSubIngestionController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly registryService: PubSubRegistryService,
    private readonly cls: ClsService,
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

    // Extract tracing and correlation metadata from Pub/Sub message attributes.
    // If the message was published by our backend, originRequestId and traceContext
    // will link this push execution to the original client request.
    const incomingMessageId = payload?.message?.messageId;
    const attributes = payload?.message?.attributes;
    const originRequestId =
      attributes?.originRequestId ?? attributes?.requestId;
    const originTraceContext =
      attributes?.traceContext ??
      attributes?.traceparent ??
      attributes?.['x-cloud-trace-context'];

    // Prioritize originRequestId so downstream subscriber logs share the exact
    // same requestId in GCP Cloud Logging and BigQuery. Fall back to incomingMessageId
    // (stable across retries) or a generated UUID if unpublished internally.
    const correlationId = originRequestId ?? incomingMessageId ?? randomUUID();
    try {
      this.cls.set('requestId', correlationId);
      if (originRequestId) {
        this.cls.set('originRequestId', originRequestId);
      }
      if (incomingMessageId) {
        this.cls.set('pubsubMessageId', incomingMessageId);
      }
      if (originTraceContext) {
        this.cls.set('traceContext', originTraceContext);
      }
    } catch {
      // Context not available in non-CLS execution environments
    }

    // Do NOT log the full payload wholesale (PII safety). Log the metadata instead.
    this.logger.event(LOG_EVENT.PUBSUB_MESSAGE_RECEIVED, {
      messageId: incomingMessageId,
      eventType: payload?.message?.attributes?.eventType,
      ...(originRequestId && { originRequestId }),
    });

    if (!payload?.message) {
      this.logger.warn('Ignored invalid payload: missing message object', {
        step: 'ingest_check',
      });
      return;
    }

    const { message } = payload;
    const { data, messageId } = message;
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
      this.logger.event(LOG_EVENT.PUBSUB_MESSAGE_PROCESSED, {
        ...ctx,
      });
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
