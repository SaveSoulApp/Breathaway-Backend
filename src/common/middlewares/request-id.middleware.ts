import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Enforces the presence and validity of the `X-Request-ID` header on all incoming requests.
 *
 * This middleware attaches the request ID to the Express request object (`req.requestId`)
 * for downstream logging, tracing, and debugging across the system. It acts as an early
 * barrier, rejecting malformed or missing tracing identifiers before they reach controllers.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  /**
   * Validates the request ID header and injects it into the request context.
   *
   * @throws {UnauthorizedException} When the `X-Request-ID` header is missing or not a valid string.
   */
  use(req: Request, res: Response, next: NextFunction) {
    const rawId = req.headers['x-request-id'];

    if (rawId === undefined || rawId === null) {
      throw new UnauthorizedException('X-Request-ID header is required');
    }

    if (typeof rawId !== 'string') {
      throw new UnauthorizedException('X-Request-ID header must be a string');
    }

    req.requestId = rawId;

    next();
  }
}
