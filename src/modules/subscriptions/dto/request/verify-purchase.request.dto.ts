import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StorePlatform } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class VerifyPurchaseRequestDto {
  @ApiProperty({
    enum: StorePlatform,
    description: 'The platform where the purchase was made',
  })
  @IsEnum(StorePlatform)
  storePlatform: StorePlatform;

  @ApiPropertyOptional({
    description:
      'Apple originalTransactionId or Google purchaseToken used to correlate future webhook events. Required for Google Play.',
  })
  @IsString()
  @IsOptional()
  purchaseToken?: string;

  @ApiPropertyOptional({
    description:
      'StoreKit 2 cryptographically signed transaction JWS token. Required for Apple StoreKit 2.',
  })
  @IsString()
  @IsOptional()
  signedTransactionInfo?: string;

  @ApiProperty({
    description: 'Store product identifier (e.g. com.app.plan.monthly)',
  })
  @IsString()
  productId: string;

  @ApiPropertyOptional({
    description:
      'Android package name (e.g. com.breathaway.app). Defaults to application package name.',
  })
  @IsString()
  @IsOptional()
  packageName?: string;

  @ApiPropertyOptional({
    description:
      'Purchase date in ISO 8601 format. Note: Authoritative dates are extracted directly from Apple/Google APIs.',
  })
  @IsDateString()
  @IsOptional()
  purchaseDate?: string;

  @ApiPropertyOptional({
    description:
      'Expiry date in ISO 8601 format. Note: Authoritative dates are extracted directly from Apple/Google APIs.',
  })
  @IsDateString()
  @IsOptional()
  expiresDate?: string;
}
