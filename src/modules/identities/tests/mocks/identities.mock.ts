import { DateUtil } from '@common/utils/date.utils';
import { IdentityType } from '@prisma/client';

export const mockUserId = 'user-123';
export const mockIdentityId = 'identity-123';

export const mockCreateIdentityRequestDto = {
  type: IdentityType.EMAIL,
  publicValue: 'test@example.com',
};

export const mockUpdateIdentityRequestDto = {
  publicValue: 'updated@example.com',
};

export const mockEncryptedData = {
  publicValueHash: Buffer.from('hash-abc-32-bytes-mock-hash-1234'),
  publicValueCiphertext: Buffer.from('cipher-abc'),
  publicValueIv: Buffer.from('iv-abc-12-byte'),
  publicValueTag: Buffer.from('tag-abc-16-byte'),
  publicValueWrappedKey: Buffer.from('wrap-abc'),
  publicValueKeyId: 'key-abc',
  publicValueMasked: 't•••t@example.com',
};

export const mockPlatformIdData = {
  platformIdHash: Buffer.from('plat-hash-abc-32-bytes-mock-hash'),
  platformIdCiphertext: Buffer.from('plat-cipher-abc'),
  platformIdIv: Buffer.from('plat-iv-abc-12-byte'),
  platformIdTag: Buffer.from('plat-tag-abc-16-byte'),
  platformIdWrappedKey: Buffer.from('plat-wrap-abc'),
  platformIdKeyId: 'plat-key-abc',
};

export const mockIdentityData = {
  id: mockIdentityId,
  type: IdentityType.EMAIL,
  isVerified: false,
  verifiedAt: null,
  createdAt: DateUtil.now(),
  deletedAt: null,
  userId: mockUserId,
  publicValueCiphertext: Buffer.from('cipher-abc'),
  publicValueIv: Buffer.from('iv-abc-12-byte'),
  publicValueTag: Buffer.from('tag-abc-16-byte'),
  publicValueWrappedKey: Buffer.from('wrap-abc'),
  publicValueKeyId: 'key-abc',
  publicValueHash: Buffer.from('hash-abc-32-bytes-mock-hash-1234'),
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
