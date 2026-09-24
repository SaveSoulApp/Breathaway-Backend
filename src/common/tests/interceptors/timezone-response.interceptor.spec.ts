import { lastValueFrom, Observable } from 'rxjs';

import { TimezoneResponseInterceptor } from '../../interceptors/timezone-response.interceptor';
import {
  createMockCallHandler,
  createMockExecutionContext,
} from '../mocks/execution-context.mock';

describe('TimezoneResponseInterceptor', () => {
  let interceptor: TimezoneResponseInterceptor;

  beforeEach(() => {
    interceptor = new TimezoneResponseInterceptor();
  });

  it('should return untouched response when request has no timezone', async () => {
    // Arrange
    const context = createMockExecutionContext({});
    const payload = { date: new Date('2024-01-01T12:00:00.000Z') };
    const callHandler = createMockCallHandler(payload);

    // Act
    const resultObservable = interceptor.intercept(
      context,
      callHandler,
    ) as Observable<typeof payload>;
    const result = await lastValueFrom(resultObservable);

    // Assert
    expect(result).toBe(payload);
  });

  it('should format Date objects using toISOString when timezone is UTC', async () => {
    // Arrange
    const date = new Date('2024-01-01T12:00:00.000Z');
    const context = createMockExecutionContext({ timezone: 'UTC' });
    const payload = {
      id: '123',
      createdAt: date,
      nested: {
        updatedAt: date,
      },
    };
    const callHandler = createMockCallHandler(payload);

    // Act
    const resultObservable = interceptor.intercept(
      context,
      callHandler,
    ) as Observable<any>;
    const result = await lastValueFrom(resultObservable);

    // Assert
    expect(result.id).toBe('123');
    expect(result.createdAt).toBe('2024-01-01T12:00:00.000Z');
    expect(result.nested.updatedAt).toBe('2024-01-01T12:00:00.000Z');
  });

  it('should format Date objects according to non-UTC timezone using dayjs tz', async () => {
    // Arrange
    const date = new Date('2024-01-01T12:00:00.000Z');
    const context = createMockExecutionContext({ timezone: 'Asia/Kolkata' });
    const payload = {
      createdAt: date,
    };
    const callHandler = createMockCallHandler(payload);

    // Act
    const resultObservable = interceptor.intercept(
      context,
      callHandler,
    ) as Observable<any>;
    const result = await lastValueFrom(resultObservable);

    // Assert
    // Asia/Kolkata is +05:30 -> 17:30:00
    expect(result.createdAt).toContain('+05:30');
    expect(result.createdAt).toContain('2024-01-01T17:30:00');
  });

  it('should recursively handle arrays containing dates and objects', async () => {
    // Arrange
    const date1 = new Date('2024-01-01T00:00:00.000Z');
    const date2 = new Date('2024-01-02T00:00:00.000Z');
    const context = createMockExecutionContext({ timezone: 'UTC' });
    const payload = [
      { id: 1, date: date1 },
      { id: 2, date: date2 },
    ];
    const callHandler = createMockCallHandler(payload);

    // Act
    const resultObservable = interceptor.intercept(
      context,
      callHandler,
    ) as Observable<any>;
    const result = await lastValueFrom(resultObservable);

    // Assert
    expect(result[0].date).toBe('2024-01-01T00:00:00.000Z');
    expect(result[1].date).toBe('2024-01-02T00:00:00.000Z');
  });

  it('should handle primitives, null, and undefined values without alteration', async () => {
    // Arrange
    const context = createMockExecutionContext({ timezone: 'UTC' });
    const payload = {
      num: 42,
      str: 'hello',
      bool: true,
      nil: null,
      undef: undefined,
    };
    const callHandler = createMockCallHandler(payload);

    // Act
    const resultObservable = interceptor.intercept(
      context,
      callHandler,
    ) as Observable<any>;
    const result = await lastValueFrom(resultObservable);

    // Assert
    expect(result).toEqual(payload);
  });
});
