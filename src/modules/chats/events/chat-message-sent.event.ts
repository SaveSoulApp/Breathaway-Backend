/**
 * Event name constant emitted whenever a chat message is successfully persisted.
 */
export const CHAT_MESSAGE_SENT_EVENT = 'chat.message.sent';

/**
 * Domain event payload dispatched when a user sends a chat message in a match conversation.
 *
 * Emitted by `ChatsService` and consumed by `NotificationEventsListener` to decouple
 * domain chat persistence from push/email notification delivery mechanics.
 */
export class ChatMessageSentEvent {
  constructor(
    public readonly messageId: string,
    public readonly roomId: string,
    public readonly matchId: string,
    public readonly senderId: string,
    public readonly recipientId: string,
    public readonly content: string,
    public readonly sentAt: Date = new Date(),
  ) {}
}
