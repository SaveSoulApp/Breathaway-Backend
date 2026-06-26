# NestJS Comment Patterns — Annotated Examples

This file contains full before/after examples for every major NestJS element type.
Load this before writing any comments so your output matches production conventions.

---

## Table of Contents
1. [Controller](#1-controller)
2. [Service / Provider](#2-service--provider)
3. [Module](#3-module)
4. [DTO](#4-dto)
5. [Guard](#5-guard)
6. [Interceptor](#6-interceptor)
7. [Pipe](#7-pipe)
8. [Common Mistakes](#8-common-mistakes)

---

## 1. Controller

Controllers own an HTTP resource group. The class comment names the resource and its auth scope.
Each route handler comment explains what the endpoint *does for the caller* and what they get back.

### Before
```ts
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateOrderDto, @Request() req) {
    return this.ordersService.create(dto, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, OrderOwnerGuard)
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}
```

### After
```ts
/**
 * Handles HTTP operations for the /orders resource.
 *
 * Read endpoints are public; write and delete endpoints require a valid JWT
 * and, for destructive actions, proof of order ownership.
 */
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Retrieves a single order by its unique identifier.
   *
   * @param id - UUID of the order to retrieve.
   * @returns The matching order with its line items and current status.
   * @throws {NotFoundException} When no order exists with the given id.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  /**
   * Creates a new order on behalf of the authenticated user.
   *
   * The caller's user ID is derived from the JWT payload — it cannot be
   * overridden by the request body.
   *
   * @param dto - Line items, shipping address, and payment method for the order.
   * @returns The newly created order including its generated ID and initial status.
   * @throws {BadRequestException} When any line item references a product that is
   *   out of stock or has been discontinued.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateOrderDto, @Request() req) {
    return this.ordersService.create(dto, req.user.id);
  }

  /**
   * Permanently removes an order, provided the authenticated user owns it.
   *
   * Deletion is only permitted for orders in PENDING status. Fulfilled or
   * in-transit orders must be cancelled through the /cancellations endpoint.
   *
   * @param id - UUID of the order to delete.
   * @throws {NotFoundException} When no order exists with the given id.
   * @throws {ForbiddenException} When the authenticated user does not own the order.
   * @throws {ConflictException} When the order is in a non-deletable status.
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, OrderOwnerGuard)
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}
```

---

## 2. Service / Provider

Services own business logic. Class comments describe the domain they encapsulate.
Method comments explain the business rule being enforced and every exception that can escape.

### Before
```ts
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private repo: Repository<Payment>,
    private readonly stripeClient: StripeClient,
    private readonly emailService: EmailService,
  ) {}

  async charge(userId: string, amount: number, currency: string): Promise<Payment> {
    const existing = await this.repo.findOne({ where: { userId, status: 'pending' } });
    if (existing) throw new ConflictException();
    const intent = await this.stripeClient.createPaymentIntent(amount, currency);
    const payment = this.repo.create({ userId, amount, currency, stripeIntentId: intent.id });
    await this.repo.save(payment);
    await this.emailService.sendReceipt(userId, payment);
    return payment;
  }

  async refund(paymentId: string): Promise<void> {
    const payment = await this.repo.findOneOrFail({ where: { id: paymentId } });
    await this.stripeClient.refundPaymentIntent(payment.stripeIntentId);
    payment.status = 'refunded';
    await this.repo.save(payment);
  }
}
```

### After
```ts
/**
 * Orchestrates payment lifecycle operations — charging, refunding, and tracking
 * payment state — by coordinating with Stripe and the local payments database.
 *
 * All monetary amounts are in the smallest currency unit (e.g., cents for USD)
 * to avoid floating-point precision issues.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private repo: Repository<Payment>,
    private readonly stripeClient: StripeClient,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Initiates a payment charge for a user and records it in the database.
   *
   * Prevents duplicate charges by rejecting requests when a pending payment
   * already exists for the same user. On success, fires a receipt email
   * asynchronously via the EmailService — email failure does NOT roll back
   * the payment record.
   *
   * @param userId - ID of the user being charged.
   * @param amount - Charge amount in the smallest currency unit (e.g., 1999 = $19.99 USD).
   * @param currency - ISO 4217 currency code (e.g., "usd", "eur").
   * @returns The persisted Payment entity including the Stripe payment intent ID.
   * @throws {ConflictException} When a pending payment already exists for this user.
   * @throws {StripeException} When Stripe rejects the payment intent creation (e.g., invalid card).
   */
  async charge(userId: string, amount: number, currency: string): Promise<Payment> {
    const existing = await this.repo.findOne({ where: { userId, status: 'pending' } });
    if (existing) throw new ConflictException();
    const intent = await this.stripeClient.createPaymentIntent(amount, currency);
    const payment = this.repo.create({ userId, amount, currency, stripeIntentId: intent.id });
    await this.repo.save(payment);
    await this.emailService.sendReceipt(userId, payment);
    return payment;
  }

  /**
   * Issues a full refund for a completed payment via Stripe and marks the
   * local record as refunded.
   *
   * Partial refunds are not supported; use the Stripe dashboard for partial
   * adjustments. This method does not notify the user — the caller is responsible
   * for any downstream communication.
   *
   * @param paymentId - Internal UUID of the payment to refund.
   * @throws {EntityNotFoundError} When no payment exists with the given ID.
   * @throws {StripeException} When Stripe cannot process the refund (e.g., already refunded).
   */
  async refund(paymentId: string): Promise<void> {
    const payment = await this.repo.findOneOrFail({ where: { id: paymentId } });
    await this.stripeClient.refundPaymentIntent(payment.stripeIntentId);
    payment.status = 'refunded';
    await this.repo.save(payment);
  }
}
```

---

## 3. Module

Module comments explain the bounded context and justify why each import and export exists.
Think of this as the module's README — a new engineer should understand the dependency graph
from the comment alone.

### Before
```ts
@Module({
  imports: [TypeOrmModule.forFeature([Order, Payment]), StripeModule, EmailModule],
  providers: [OrdersService, PaymentsService],
  exports: [OrdersService],
})
export class OrdersModule {}
```

### After
```ts
/**
 * Encapsulates the order management bounded context — creating, fulfilling,
 * and cancelling customer orders — along with the payment operations they trigger.
 *
 * Imports:
 *   - TypeOrmModule: provides repository access to the Order and Payment entities.
 *   - StripeModule: wraps the Stripe SDK for payment intent creation and refunds.
 *   - EmailModule: delivers transactional receipts and cancellation notices.
 *
 * Exports:
 *   - OrdersService: exposed so ShippingModule can query order status without
 *     creating a circular dependency through PaymentsModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Order, Payment]), StripeModule, EmailModule],
  providers: [OrdersService, PaymentsService],
  exports: [OrdersService],
})
export class OrdersModule {}
```

---

## 4. DTO

DTO class comments name the operation and the context in which this shape is used.
Property comments explain validation constraints and any non-obvious semantics.
Skip property comments when the name, type, and decorator are fully self-explanatory.

### Before
```ts
export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  items: LineItemDto[];

  @IsString()
  @IsNotEmpty()
  shippingAddressId: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
```

### After
```ts
/**
 * Payload for creating a new customer order.
 * Submitted to POST /orders; all fields are validated before the order is persisted.
 */
export class CreateOrderDto {
  /** One or more products the customer intends to purchase, with quantities. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  items: LineItemDto[];

  /**
   * ID of a saved address from the user's address book.
   * The address must belong to the authenticated user or validation will fail downstream.
   */
  @IsString()
  @IsNotEmpty()
  shippingAddressId: string;

  /** Optional promotional code applied before order total is calculated. Invalid codes are silently ignored. */
  @IsOptional()
  @IsString()
  couponCode?: string;

  // No comment needed — PaymentMethod enum values are self-documenting.
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
```

---

## 5. Guard

Guard class comments state the access rule enforced. The `canActivate` comment explains
what conditions grant or deny access and what side effects (if any) occur (e.g., attaching
data to the request).

### Before
```ts
@Injectable()
export class OrderOwnerGuard implements CanActivate {
  constructor(private readonly ordersService: OrdersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const orderId = request.params.id;
    const userId = request.user?.id;
    const order = await this.ordersService.findById(orderId);
    return order.userId === userId;
  }
}
```

### After
```ts
/**
 * Restricts route access to the user who owns the target order.
 *
 * Assumes a prior `JwtAuthGuard` has populated `request.user` — this guard
 * must be applied after JWT authentication in the guard chain.
 */
@Injectable()
export class OrderOwnerGuard implements CanActivate {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Grants access only when the authenticated user's ID matches the order's owner.
   *
   * Fetches the order by the `:id` route param on each invocation — no caching.
   * Returns false (triggering a 403 Forbidden) rather than throwing, so callers
   * cannot distinguish "not found" from "not authorized".
   *
   * @returns `true` if the authenticated user owns the order; `false` otherwise.
   * @throws {NotFoundException} When no order exists with the given id (propagated
   *   from OrdersService.findById).
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const orderId = request.params.id;
    const userId = request.user?.id;
    const order = await this.ordersService.findById(orderId);
    return order.userId === userId;
  }
}
```

---

## 6. Interceptor

Interceptor class comments name the cross-cutting concern. The `intercept` comment explains
the transformation or side effect applied to the request/response stream.

### Before
```ts
@Injectable()
export class ResponseTimeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        response.setHeader('X-Response-Time', `${Date.now() - start}ms`);
      }),
    );
  }
}
```

### After
```ts
/**
 * Adds an `X-Response-Time` header to every HTTP response, reporting the
 * wall-clock time in milliseconds from when the request entered the handler
 * to when the response was emitted.
 *
 * Useful for client-side performance tracing and APM dashboards without
 * requiring a full distributed tracing setup.
 */
@Injectable()
export class ResponseTimeInterceptor implements NestInterceptor {
  /**
   * Wraps the downstream handler, measures its execution duration, and
   * attaches the result as a response header.
   *
   * Timing begins at the intercept call — after NestJS routing but before
   * the controller method executes.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        response.setHeader('X-Response-Time', `${Date.now() - start}ms`);
      }),
    );
  }
}
```

---

## 7. Pipe

Pipe class comments explain what the pipe transforms or validates and why the transformation
is needed at the framework boundary rather than inside a service.

### Before
```ts
@Injectable()
export class ParsePositiveIntPipe implements PipeTransform {
  transform(value: any): number {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new BadRequestException(`Expected a positive integer, received: ${value}`);
    }
    return parsed;
  }
}
```

### After
```ts
/**
 * Validates and coerces a route or query parameter to a positive integer.
 *
 * Use this instead of the built-in `ParseIntPipe` when zero or negative
 * values must be rejected at the HTTP layer — for example, for pagination
 * `limit` and `page` parameters.
 */
@Injectable()
export class ParsePositiveIntPipe implements PipeTransform {
  /**
   * Parses the raw string value and rejects non-positive or non-numeric input
   * before it reaches the controller or service layer.
   *
   * @param value - Raw string value from the incoming request parameter.
   * @returns The parsed integer if valid.
   * @throws {BadRequestException} When the value is not a number or is ≤ 0.
   */
  transform(value: any): number {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new BadRequestException(`Expected a positive integer, received: ${value}`);
    }
    return parsed;
  }
}
```

---

## 8. Common Mistakes

### ❌ Restating the type signature
```ts
// BAD — the parameter name and type already say this
@param userId - The user's ID string.

// GOOD — adds context the signature doesn't provide
@param userId - UUID of the authenticated user; sourced from the JWT payload, not the request body.
```

### ❌ Vague @throws
```ts
// BAD
@throws {Error} If something goes wrong.

// GOOD
@throws {NotFoundException} When no user exists with the given id.
@throws {ConflictException} When the email address is already registered.
```

### ❌ Filler sentences
```ts
// BAD
/** This method is responsible for handling the creation of a new user account. */

// GOOD
/** Creates a user account and sends an email verification link. */
```

### ❌ Documenting private / internal helpers
Only comment public methods and exported classes. Private helpers within a service
class do not need JSDoc unless they contain non-obvious logic that would confuse a
reader of the class at a glance. In that case, a single-line `//` comment is sufficient.

### ❌ Missing @throws on async methods that delegate to external services
If a method calls Stripe, a database, an HTTP API, or any provider that can throw,
document what exception bubbles up. Callers need to know what to catch.