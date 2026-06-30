# GCP Identity Platform / Firebase Auth Guidelines

Reference for token verification, claims extraction, and guard implementation in NestJS
using GCP Identity Platform (Firebase Auth under the hood — same Admin SDK and token format).

---

## 1. Setup

Install the Firebase Admin SDK:
```bash
npm install firebase-admin
```

Initialize once, using a service account key sourced from **GCP Secret Manager** — never a
committed JSON file:

```typescript
// firebase-admin.provider.ts
import * as admin from 'firebase-admin';

export const FIREBASE_ADMIN = Symbol('FIREBASE_ADMIN');

export const FirebaseAdminProvider = {
  provide: FIREBASE_ADMIN,
  useFactory: (configService: ConfigService) => {
    const serviceAccount = JSON.parse(
      configService.getOrThrow<string>('FIREBASE_SERVICE_ACCOUNT_JSON'),  // pulled from Secret Manager at deploy time
    );
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  },
  inject: [ConfigService],
};
```

> ⚠️ Never read the service account JSON from a file checked into the repo. In Cloud Run,
> mount it as a Secret Manager secret and reference it via environment variable.

---

## 2. Token Extraction

Always extract the ID token from the `Authorization` header using the `Bearer` scheme.
Never accept a token from a query param, cookie without `HttpOnly`+`Secure`, or request body.

```typescript
function extractToken(request: Request): string | null {
  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
}
```

---

## 3. Token Verification (server-side, mandatory)

**Never** decode the JWT client-side or with a non-verifying decode (e.g., `jwt-decode`) and
trust the payload. Always verify the signature and claims server-side via the Admin SDK.

```typescript
// firebase-auth.guard.ts
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    @Inject(FIREBASE_ADMIN) private readonly firebaseAdmin: admin.app.App,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = extractToken(request);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      const decodedToken = await this.firebaseAdmin.auth().verifyIdToken(token, true); // checkRevoked: true
      request.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        roles: decodedToken.roles ?? [],          // custom claim, see section 4
        tenantId: decodedToken.tenant ?? null,      // if using multi-tenant Identity Platform
      };
      return true;
    } catch (error) {
      if (error.code === 'auth/id-token-expired') {
        throw new UnauthorizedException('Token expired');
      }
      if (error.code === 'auth/id-token-revoked') {
        throw new UnauthorizedException('Token revoked');
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

**Rules:**
- Always pass `checkRevoked: true` to `verifyIdToken` for sensitive operations — this adds a
  round trip but catches tokens revoked due to password change or account disable.
- Catch and differentiate `auth/id-token-expired` vs `auth/id-token-revoked` vs malformed —
  all should return `401`, but distinct logging helps detect attack patterns.
- Never swallow verification errors and fall through to "treat as anonymous" — always reject.

---

## 4. Custom Claims for RBAC

Roles must be stored as **custom claims** on the Firebase/Identity Platform user, set via
the Admin SDK server-side — never settable by the client.

### Setting claims (admin-only operation, server-side)
```typescript
// Only callable from a privileged admin use case, itself guarded by RolesGuard
await admin.auth().setCustomUserClaims(uid, { roles: ['ADMIN'] });
```

### Reading claims in a guard
```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.roles) throw new ForbiddenException('No roles assigned');

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
```

### Usage on a controller
```typescript
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ADMIN')
@Delete(':id')
async deleteUser(@Param('id') id: string) { ... }
```

### Claims propagation delay (important gotcha)
Custom claims set via `setCustomUserClaims` do **not** take effect on the client's current
ID token until it refreshes (tokens are valid up to 1 hour). If a role change must take
effect immediately, the backend use case that changes roles should also call
`admin.auth().revokeRefreshTokens(uid)` to force the client to re-authenticate.

---

## 5. Public Endpoint Marking

Never rely on the absence of `@UseGuards()` to signal a public route — that's invisible in a
diff and easy to miss in review. Use an explicit decorator instead.

```typescript
// public.decorator.ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

```typescript
@Public()
@Post('register')
async register(@Body() dto: RegisterDto) { ... }
```

Apply `FirebaseAuthGuard` **globally** (via `APP_GUARD`) so every new endpoint is secure by
default, and only opt out explicitly:

```typescript
// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: FirebaseAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
]
```

---

## 6. Resolving the Identity Platform User to a Local DB User

Firebase/Identity Platform manages identity; your Prisma `User` table manages application data.
Link them via the Firebase `uid`, stored as a unique field on the local `User` model.

```prisma
model User {
  id          String   @id @default(uuid())
  firebaseUid String   @unique
  email       String   @unique
  name        String
  // ... application-specific fields
}
```

In the use case, resolve from the verified token — never trust a `userId` passed in the
request body if it can be derived from `request.user.uid`.

```typescript
// ❌ Wrong — trusting client-supplied userId
async createPost(@Body() dto: CreatePostDto) {
  return this.createPostUseCase.execute(dto.userId, dto.content);  // client controls userId
}

// ✅ Correct — derive from verified token
@Post()
async createPost(@Req() req: AuthenticatedRequest, @Body() dto: CreatePostDto) {
  return this.createPostUseCase.execute(req.user.uid, dto.content);
}
```

---

## 7. Multi-Tenancy (if applicable)

If using Identity Platform's multi-tenant support (separate tenant per customer/org):
- Always verify the token's `tenant` (firebase `tid`) claim matches the expected tenant for
  the request (e.g., from a subdomain or path param) before processing.
- Never allow a token issued for Tenant A to access resources scoped to Tenant B, even if
  the role check passes — tenant isolation is checked independently of role checks.

```typescript
if (decodedToken.tenant !== expectedTenantId) {
  throw new ForbiddenException('Tenant mismatch');
}
```

---

## 8. Local Development & Testing

- Use the Firebase Auth emulator (`firebase emulators:start --only auth`) for local dev and
  integration tests — never point local development at the production Identity Platform tenant.
- Mock `FirebaseAuthGuard` in unit tests by overriding it with a test guard that injects a
  fixed `request.user`, rather than generating real tokens in test setup.
