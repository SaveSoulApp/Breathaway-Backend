import { plainToInstance } from 'class-transformer';

import { RefreshInstagramTokenResponseDto } from '../dto/response/refresh-instagram-token.response.dto';

describe('RefreshInstagramTokenResponseDto', () => {
  it('should transform and expose expected properties correctly', () => {
    const raw = {
      access_token: 'IGQVJvalidToken',
      token_type: 'bearer',
      expires_in: 5184000,
      unexposed_field: 'should-be-stripped',
    };

    const instance = plainToInstance(RefreshInstagramTokenResponseDto, raw, {
      excludeExtraneousValues: true,
    });

    expect(instance.access_token).toBe('IGQVJvalidToken');
    expect(instance.token_type).toBe('bearer');
    expect(instance.expires_in).toBe(5184000);
    expect(
      (instance as unknown as Record<string, unknown>).unexposed_field,
    ).toBeUndefined();
  });
});
