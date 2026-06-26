import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Secures routes by requiring a valid JSON Web Token (JWT).
 *
 * Extends the default Passport JWT strategy to enforce authentication at the route or controller level.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
