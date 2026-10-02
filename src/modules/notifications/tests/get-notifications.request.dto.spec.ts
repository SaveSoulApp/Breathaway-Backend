import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GetNotificationsRequestDto } from '../dto/request/get-notifications.request.dto';
import { NotificationCategory } from '../enums/notification-category.enum';

describe('GetNotificationsRequestDto', () => {
  it('should use default values when no query params are provided', async () => {
    const dto = plainToInstance(GetNotificationsRequestDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(20);
    expect(dto.unreadOnly).toBe(false);
    expect(dto.cursor).toBeUndefined();
    expect(dto.category).toBeUndefined();
  });

  it('should correctly transform string "false" to boolean false for unreadOnly', async () => {
    const dto = plainToInstance(GetNotificationsRequestDto, {
      unreadOnly: 'false',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.unreadOnly).toBe(false);
  });

  it('should correctly transform string "true" to boolean true for unreadOnly', async () => {
    const dto = plainToInstance(GetNotificationsRequestDto, {
      unreadOnly: 'true',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.unreadOnly).toBe(true);
  });

  it('should correctly parse boolean true and false literals', async () => {
    const dtoTrue = plainToInstance(GetNotificationsRequestDto, {
      unreadOnly: true,
    });
    const dtoFalse = plainToInstance(GetNotificationsRequestDto, {
      unreadOnly: false,
    });

    expect(await validate(dtoTrue)).toHaveLength(0);
    expect(dtoTrue.unreadOnly).toBe(true);

    expect(await validate(dtoFalse)).toHaveLength(0);
    expect(dtoFalse.unreadOnly).toBe(false);
  });

  it('should parse numeric string limit and validate bounds', async () => {
    const validDto = plainToInstance(GetNotificationsRequestDto, {
      limit: '50',
      category: NotificationCategory.SOCIAL,
      cursor: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
    const errors = await validate(validDto);

    expect(errors).toHaveLength(0);
    expect(validDto.limit).toBe(50);
    expect(validDto.category).toBe(NotificationCategory.SOCIAL);
    expect(validDto.cursor).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
  });

  it('should fail validation when limit is below minimum or above maximum', async () => {
    const tooLow = plainToInstance(GetNotificationsRequestDto, { limit: 0 });
    const tooHigh = plainToInstance(GetNotificationsRequestDto, { limit: 101 });

    const errorsLow = await validate(tooLow);
    const errorsHigh = await validate(tooHigh);

    expect(errorsLow.length).toBeGreaterThan(0);
    expect(errorsHigh.length).toBeGreaterThan(0);
  });
});
