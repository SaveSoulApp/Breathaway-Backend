import { IdentityType, IntentType, LikeStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LikeListQueryDto } from '../dto';

describe('LikeListQueryDto', () => {
  it('should accept valid status, intent, and targetIdentityType filters', async () => {
    // Arrange
    const payload = {
      status: LikeStatus.VOIDED,
      intent: IntentType.RELATIONSHIP,
      targetIdentityType: IdentityType.PHONE,
    };

    // Act
    const dto = plainToInstance(LikeListQueryDto, payload);
    const errors = await validate(dto);

    // Assert
    expect(errors).toHaveLength(0);
    expect(dto.status).toBe(LikeStatus.VOIDED);
    expect(dto.intent).toBe(IntentType.RELATIONSHIP);
    expect(dto.targetIdentityType).toBe(IdentityType.PHONE);
  });

  it('should normalize lowercase targetIdentityType query parameter to uppercase', async () => {
    // Arrange
    const payload = { targetIdentityType: 'instagram' };

    // Act
    const dto = plainToInstance(LikeListQueryDto, payload);
    const errors = await validate(dto);

    // Assert
    expect(errors).toHaveLength(0);
    expect(dto.targetIdentityType).toBe(IdentityType.INSTAGRAM);
  });

  it('should reject an invalid targetIdentityType value', async () => {
    // Arrange
    const payload = { targetIdentityType: 'SNAPCHAT' };

    // Act
    const dto = plainToInstance(LikeListQueryDto, payload);
    const errors = await validate(dto);

    // Assert
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('targetIdentityType');
  });
});
