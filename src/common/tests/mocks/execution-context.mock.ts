import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

export const createMockExecutionContext = (
  reqMock: any = {},
  resMock: any = {},
  handlerMock: any = jest.fn(),
  classMock: any = jest.fn(),
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => reqMock,
      getResponse: () => resMock,
      getNext: () => jest.fn(),
    }),
    getHandler: () => handlerMock,
    getClass: () => classMock,
    // Mock other RPC/GraphQL contexts if necessary, returning jest.fn()
  }) as unknown as ExecutionContext;

export const createMockCallHandler = (returnValue: any = {}): CallHandler => ({
  handle: () => of(returnValue),
});
