import { validate } from 'class-validator';
import { IsValidTimezone } from '../../decorators/is-valid-timezone.decorator';

class TestDto {
  @IsValidTimezone()
  timezone: string;
}

describe('@IsValidTimezone Decorator', () => {
  let dto: TestDto;

  beforeEach(() => {
    dto = new TestDto();
  });

  it('should validate successfully for empty/undefined values', async () => {
    dto.timezone = undefined as any;
    let errors = await validate(dto);
    expect(errors.length).toBe(0);

    dto.timezone = null as any;
    errors = await validate(dto);
    expect(errors.length).toBe(0);

    dto.timezone = '';
    errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate successfully for a correct timezone', async () => {
    dto.timezone = 'America/New_York';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation if timezone is not a string', async () => {
    dto.timezone = 123 as any;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.isValidTimezone).toBe(
      'Timezone must be a string',
    );
  });

  it('should fail validation for incorrect timezone with suggestion', async () => {
    dto.timezone = 'new_york';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.isValidTimezone).toContain(
      'is not a valid IANA timezone. Did you mean "America/New_York"?',
    );
  });

  it('should fail validation for completely invalid timezone with examples', async () => {
    dto.timezone = 'Invalid/Timezone';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.isValidTimezone).toContain(
      'is not a valid IANA timezone. Examples: "Asia/Kolkata", "America/New_York", "Europe/London"',
    );
  });
});
