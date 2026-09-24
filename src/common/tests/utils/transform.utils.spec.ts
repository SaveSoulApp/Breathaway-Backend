import { Prisma } from '@prisma/client';
import { Expose } from 'class-transformer';

import { transformToDto } from '@common/utils/transform.utils';

class SampleDto {
  @Expose()
  id: string;

  @Expose()
  amount: number;

  secret: string;
}

describe('transformToDto', () => {
  it('should transform plain object to class instance and strip extraneous unexposed fields', () => {
    // Arrange
    const plain = {
      id: 'abc-123',
      amount: new Prisma.Decimal('19.99'),
      secret: 'should-be-omitted',
      extraField: 'also-omitted',
    };

    // Act
    const result = transformToDto(SampleDto, plain);

    // Assert
    expect(result).toBeInstanceOf(SampleDto);
    expect(result.id).toBe('abc-123');
    expect(result.amount).toBe(19.99);
    expect(typeof result.amount).toBe('number');
    expect((result as any).secret).toBeUndefined();
    expect((result as any).extraField).toBeUndefined();
  });
});
