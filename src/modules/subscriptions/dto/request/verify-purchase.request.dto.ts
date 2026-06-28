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

  @ApiProperty({
    description:
      'Apple originalTransactionId or Google purchaseToken used to correlate future webhook events',
  })
  @IsString()
  purchaseToken: string;

  @ApiProperty({
    description: 'Store product identifier (e.g. com.app.plan.monthly)',
  })
  @IsString()
  productId: string;

  @ApiPropertyOptional({
    description:
      'Purchase date in ISO 8601 format. Required for Apple; Google is fetched via API.',
  })
  @IsDateString()
  @IsOptional()
  purchaseDate?: string;

  @ApiPropertyOptional({
    description:
      'Expiry date in ISO 8601 format. Required for Apple; Google is fetched via API.',
  })
  @IsDateString()
  @IsOptional()
  expiresDate?: string;
}
