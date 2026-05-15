import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class DeviceIdMiddleware implements NestMiddleware {
  constructor() {
    this.initializeMiddleware();
  }

  private initializeMiddleware() {}

  use(req: Request, res: Response, next: NextFunction) {
    const deviceId = req.headers['x-device-id'];

    if (!deviceId) {
      throw new UnauthorizedException('X-Device-ID header is required');
    }

    if (typeof deviceId !== 'string') {
      throw new UnauthorizedException('X-Device-ID header must be a string');
    }

    // Store the validated Device Id for use in controllers
    req['deviceId'] = deviceId;

    next();
  }
}
