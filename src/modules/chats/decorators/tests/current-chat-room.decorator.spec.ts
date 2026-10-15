import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { ChatRoomRecord } from '@modules/chats/interfaces';
import { createMockExecutionContext } from 'src/common/tests/mocks/execution-context.mock';

import { CurrentChatRoom } from '../current-chat-room.decorator';

const getParamDecoratorFactory = (
  decorator: (...args: unknown[]) => ParameterDecorator,
) => {
  class TestClass {
    testMethod(@decorator() _param: unknown) {
      return _param;
    }
  }
  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestClass,
    'testMethod',
  ) as Record<string, { factory: (...args: unknown[]) => unknown }>;
  return args[Object.keys(args)[0]].factory;
};

describe('@CurrentChatRoom Decorator', () => {
  const factory = getParamDecoratorFactory(CurrentChatRoom);

  const mockRoom: ChatRoomRecord = {
    id: 'room-1',
    userOneId: 'user-1',
    userTwoId: 'user-2',
    wrappedRoomKey: 'd3JhcHBlZEtleQ==',
    roomKeyId: 'chat_v1',
  };

  it('should extract chatRoom from request', () => {
    const context = createMockExecutionContext({ chatRoom: mockRoom });
    const result = factory(null, context);
    expect(result).toEqual(mockRoom);
  });

  it('should throw an Error if request.chatRoom is not found', () => {
    const context = createMockExecutionContext({});
    expect(() => {
      factory(null, context);
    }).toThrow(
      'Chat room missing from request context. Ensure ChatRoomParticipantGuard is applied.',
    );
  });
});
