import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  ApiStandardErrors,
  ClientIp,
  CurrentUserId,
  UserAgent,
} from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AdminOidcAuthGuard } from '@modules/admin/guards/admin-oidc-auth.guard';

import {
  AcceptLegalConsentRequestDto,
  CreateLegalDocumentVersionRequestDto,
  LegalComplianceStatusResponseDto,
  LegalConsentQueryRequestDto,
  LegalDocumentVersionResponseDto,
  PaginatedUserLegalConsentResponseDto,
  UserLegalConsentResponseDto,
} from './dto';
import { LegalService } from './legal.service';

/**
 * Controller exposing endpoints for public legal document version discovery,
 * user compliance status checking, explicit consent acknowledgment, and administrative publishing.
 */
@ApiTags('Legal')
@ApiStandardErrors()
@Controller({
  path: 'legal',
  version: ['1'],
})
export class LegalController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly legalService: LegalService,
  ) {
    super(logger);
  }

  /**
   * Retrieves all currently active and legally enforced document versions.
   *
   * Public unauthenticated endpoint used by web and mobile frontends to display
   * canonical URLs, version tags, and SHA-256 hashes in registration and policy views.
   */
  @Get('documents')
  @ApiOperation({
    summary: 'Get active legal document versions',
    description:
      'Returns the latest active version of each legal document type (Terms of Service, Privacy Policy, Cancellation Policy).',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Active legal document versions retrieved successfully',
    type: [LegalDocumentVersionResponseDto],
  })
  @SerializeExpose(LegalDocumentVersionResponseDto)
  async getActiveDocuments(): Promise<LegalDocumentVersionResponseDto[]> {
    return this.legalService.getActiveDocuments();
  }

  /**
   * Evaluates whether the authenticated user has pending policy updates requiring re-acceptance.
   *
   * Used during application bootstrap and login to determine if a blocking re-acceptance
   * modal or informational banner should be rendered.
   */
  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get user legal compliance status',
    description:
      'Evaluates whether the authenticated user has accepted all current mandatory versions or has pending revisions.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Compliance status evaluated successfully',
    type: LegalComplianceStatusResponseDto,
  })
  @SerializeExpose(LegalComplianceStatusResponseDto)
  async getComplianceStatus(
    @CurrentUserId() userId: string,
  ): Promise<LegalComplianceStatusResponseDto> {
    return this.legalService.getUserComplianceStatus(userId);
  }

  /**
   * Records explicit user acceptance of one or more updated legal documents.
   *
   * Captures client IP, User Agent, server UTC timestamp, and links the consent
   * to the exact document version records for audit defensibility.
   */
  @Post('consents')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record user legal consent',
    description:
      'Records explicit acceptance of one or more legal document revisions for the authenticated user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Legal consent recorded successfully',
    type: [UserLegalConsentResponseDto],
  })
  @SerializeExpose(UserLegalConsentResponseDto)
  async recordConsents(
    @CurrentUserId() userId: string,
    @Body() dto: AcceptLegalConsentRequestDto,
    @ClientIp() clientIp?: string,
    @UserAgent() userAgent?: string,
  ): Promise<UserLegalConsentResponseDto[]> {
    return this.legalService.recordConsents(userId, dto, undefined, {
      ipAddress: clientIp,
      userAgent,
    });
  }

  /**
   * Retrieves the authenticated user's lifetime legal consent history.
   *
   * Provides full transparency to the user and fulfills GDPR Article 7 auditability.
   */
  @Get('history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get paginated legal consent history',
    description:
      'Retrieves the chronological audit history of legal document acceptances for the authenticated user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Consent history retrieved successfully',
    type: PaginatedUserLegalConsentResponseDto,
  })
  @SerializeExpose(PaginatedUserLegalConsentResponseDto)
  async getConsentHistory(
    @CurrentUserId() userId: string,
    @Query() query: LegalConsentQueryRequestDto,
  ): Promise<PaginatedUserLegalConsentResponseDto> {
    return this.legalService.getUserConsentHistory(userId, query);
  }

  /**
   * Administrative endpoint for publishing a new legal document version.
   *
   * Protected by GCP OpenID Connect ID token validation via AdminOidcAuthGuard.
   */
  @Post('admin/versions')
  @ApiBearerAuth()
  @UseGuards(AdminOidcAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publish a new legal document version',
    description:
      'Publishes a new revision of a legal document, superseding older active versions and dispatching notification events if required.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Legal document version published successfully',
    type: LegalDocumentVersionResponseDto,
  })
  @SerializeExpose(LegalDocumentVersionResponseDto)
  async publishVersion(
    @Body() dto: CreateLegalDocumentVersionRequestDto,
  ): Promise<LegalDocumentVersionResponseDto> {
    return this.legalService.publishVersion(dto);
  }
}
