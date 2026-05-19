import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

export const createMockExecutionContext = (
  reqMock: unknown = {},
  resMock: unknown = {},
  handlerMock: unknown = jest.fn(),
  classMock: unknown = jest.fn(),
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: (): unknown => reqMock,
      getResponse: (): unknown => resMock,
      getNext: () => jest.fn(),
    }),
    getHandler: (): unknown => handlerMock,
    getClass: (): unknown => classMock,
    // Mock other RPC/GraphQL contexts if necessary, returning jest.fn()
  }) as unknown as ExecutionContext;

export const createMockCallHandler = (
  returnValue: unknown = {},
): CallHandler => ({
  handle: () => of(returnValue),
});
