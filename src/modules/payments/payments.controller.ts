import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiStandardErrors, ClientIp, CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import {
  CreateOrderRequestDto,
  CreateOrderResponseDto,
  OrderStatusResponseDto,
  VerifyOrderRequestDto,
  VerifyOrderResponseDto,
} from './dto';
import { PaymentsService } from './payments.service';

/**
 * HTTP resource for the `/payments` domain.
 *
 * All endpoints require a valid JWT (via `JwtAuthGuard`).
 * The amount is never accepted from the client — it is always derived
 * from the `SubscriptionPlanPrice` row for the authenticated user's country.
 *
 * ## Endpoint summary
 * | Method | Path                           | Purpose                                    |
 * |--------|--------------------------------|--------------------------------------------|
 * | POST   | /payments/orders               | Create a gateway order and return action   |
 * | GET    | /payments/orders/:orderId      | Poll status after checkout closes          |
 * | POST   | /payments/orders/:orderId/verify | Server-side signature verify (shortcut)  |
 */
@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'payments',
  version: ['1'],
})
export class PaymentsController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly paymentsService: PaymentsService,
  ) {
    super(logger);
  }

  /**
   * Creates a backend-side payment order and calls the selected gateway.
   *
   * The gateway is selected by the backend based on the user's country — the
   * frontend never decides which provider to use. The response `action` object
   * tells the frontend how to open the checkout:
   * - `type: "sdk"` → open Razorpay/Cashfree SDK with the provided params.
   * - `type: "redirect"` → redirect the browser to `action.url`.
   * - `type: "form_post"` → hidden-field form POST to `action.url`.
   */
  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a payment order',
    description:
      'Creates a backend-side order and calls the gateway. Returns checkout action params. ' +
      'Amount is always derived from the SubscriptionPlanPrice — never from the request body.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Order created — checkout action returned.',
    type: CreateOrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Plan not found or inactive.',
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "No payment gateway available for the user's country.",
  })
  async createOrder(
    @CurrentUserId() userId: string,
    @Body() dto: CreateOrderRequestDto,
    @ClientIp() clientIp: string | undefined,
  ): Promise<CreateOrderResponseDto> {
    return this.paymentsService.createOrder(userId, dto, clientIp);
  }

  /**
   * Returns the current status of a payment order.
   *
   * The frontend polls this endpoint after the checkout UI closes and advances
   * only when `status === "PAID"`. The browser-side callback from the gateway
   * is never treated as proof — only a PAID status from this endpoint is.
   */
  @Get('orders/:orderId')
  @ApiOperation({
    summary: 'Get payment order status',
    description:
      'Owner-scoped: returns 404 for orders belonging to another user. ' +
      'Poll after checkout closes; proceed only when status is PAID.',
  })
  @ApiParam({
    name: 'orderId',
    description:
      'Internal PaymentOrder ULID returned by POST /payments/orders.',
    example: '01J8VXYZ1234ABCDEFGHJKMNPQ',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current order status.',
    type: OrderStatusResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Order not found or not owned by the authenticated user.',
  })
  async getOrderStatus(
    @CurrentUserId() userId: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderStatusResponseDto> {
    return this.paymentsService.getOrderStatus(userId, orderId);
  }

  /**
   * Verifies the Razorpay checkout signature server-side and marks the order PAID.
   *
   * This is the **client-side shortcut** — it saves waiting for the webhook in
   * the happy path. The webhook is still the authoritative source of truth; if
   * both arrive simultaneously the unique constraint on `Transaction` prevents
   * double-granting.
   *
   * The signature is `HMAC-SHA256(keySecret, "{razorpayOrderId}|{razorpayPaymentId}")`.
   * Returns 401 if the signature is invalid.
   */
  @Post('orders/:orderId/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Razorpay payment signature',
    description:
      'Server-side HMAC-SHA256 verification. Fulfils the order (credits granted) on success. ' +
      'Idempotent: calling again on an already-PAID order returns the existing creditsGranted.',
  })
  @ApiParam({
    name: 'orderId',
    description: 'Internal PaymentOrder ULID.',
    example: '01J8VXYZ1234ABCDEFGHJKMNPQ',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Signature verified — order is PAID.',
    type: VerifyOrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Signature verification failed.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Order not found or not owned by the authenticated user.',
  })
  async verifyPayment(
    @CurrentUserId() userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: VerifyOrderRequestDto,
  ): Promise<VerifyOrderResponseDto> {
    return this.paymentsService.verifyPayment(userId, orderId, dto);
  }
}
