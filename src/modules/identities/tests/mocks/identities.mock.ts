import { IdentityType } from '@prisma/client';

export const mockUserId = 'user-123';
export const mockIdentityId = 'identity-123';

export const mockCreateIdentityDto = {
  type: IdentityType.EMAIL,
  publicValue: 'test@example.com',
};

export const mockUpdateIdentityDto = {
  publicValue: 'updated@example.com',
};

export const mockEncryptedData = {
  publicValueHash: 'hash-abc',
  publicValueCiphertext: 'cipher-abc',
  publicValueIv: 'iv-abc',
  publicValueTag: 'tag-abc',
  publicValueWrappedKey: 'wrap-abc',
  publicValueKeyId: 'key-abc',
  publicValueMasked: 't•••t@example.com',
};

export const mockPlatformIdData = {
  platformIdHash: 'plat-hash-abc',
  platformIdCiphertext: 'plat-cipher-abc',
  platformIdIv: 'plat-iv-abc',
  platformIdTag: 'plat-tag-abc',
  platformIdWrappedKey: 'plat-wrap-abc',
  platformIdKeyId: 'plat-key-abc',
};

export const mockIdentityData = {
  id: mockIdentityId,
  type: IdentityType.EMAIL,
  isVerified: false,
  verifiedAt: null,
  createdAt: new Date(),
  deletedAt: null,
  userId: mockUserId,
  publicValueCiphertext: 'cipher-abc',
  publicValueIv: 'iv-abc',
  publicValueTag: 'tag-abc',
  publicValueWrappedKey: 'wrap-abc',
  publicValueKeyId: 'key-abc',
  publicValueHash: 'hash-abc',
  publicValueMasked: 't•••t@example.com',
  platformIdCiphertext: null,
  platformIdIv: null,
  platformIdTag: null,
  platformIdWrappedKey: null,
  platformIdKeyId: null,
  platformIdHash: null,
};

export const mockIdentityResponse = {
  id: mockIdentityId,
  type: IdentityType.EMAIL,
  isVerified: false,
  verifiedAt: null,
  createdAt: mockIdentityData.createdAt,
  deletedAt: null,
  userId: mockUserId,
  publicValueMasked: 't•••t@example.com',
};

export const mockIdentityCompleteResponse = {
  ...mockIdentityResponse,
  publicValue: 'test@example.com',
  platformId: null,
};

export const mockLookupIdentityDto = {
  type: IdentityType.EMAIL,
  publicValue: 'test@example.com',
};
