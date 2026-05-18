import {
  determineIntent,
  extractMessages,
} from '../utils/meta-webhook.parser';
import { MetaWebhookEntryDto } from '../dto';
import { MetaWebhookIntent } from '../enums/meta-webhook-intent.enum';

describe('Meta Webhook Parser Utils', () => {
  describe('determineIntent', () => {
    it('should return MESSAGE intent when messaging array is present and not empty', () => {
      const entry: MetaWebhookEntryDto = {
        id: '1',
        time: 123,
        messaging: [
          {
            sender: { id: 's1' },
            recipient: { id: 'r1' },
            timestamp: 123,
          },
        ],
      };

      expect(determineIntent(entry)).toBe(MetaWebhookIntent.MESSAGE);
    });

    it('should return UNKNOWN intent when messaging array is empty', () => {
      const entry: MetaWebhookEntryDto = {
        id: '1',
        time: 123,
        messaging: [],
      };

      expect(determineIntent(entry)).toBe(MetaWebhookIntent.UNKNOWN);
    });

    it('should return UNKNOWN intent when messaging is undefined', () => {
      const entry: MetaWebhookEntryDto = {
        id: '1',
        time: 123,
      };

      expect(determineIntent(entry)).toBe(MetaWebhookIntent.UNKNOWN);
    });
  });

  describe('extractMessages', () => {
    it('should return empty array if messaging is undefined', () => {
      const entry: MetaWebhookEntryDto = {
        id: '1',
        time: 123,
      };

      expect(extractMessages(entry)).toEqual([]);
    });

    it('should extract messages correctly', () => {
      const entry: MetaWebhookEntryDto = {
        id: '1',
        time: 123,
        messaging: [
          {
            sender: { id: 's1' },
            recipient: { id: 'r1' },
            timestamp: 12345,
            message: { mid: 'm1', text: 'hello' },
          },
        ],
      };

      const result = extractMessages(entry);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        senderId: 's1',
        recipientId: 'r1',
        messageId: 'm1',
        text: 'hello',
        timestamp: 12345,
      });
    });

    it('should ignore events without message text', () => {
      const entry: MetaWebhookEntryDto = {
        id: '1',
        time: 123,
        messaging: [
          {
            sender: { id: 's1' },
            recipient: { id: 'r1' },
            timestamp: 12345,
            message: { mid: 'm1' }, // No text
          },
          {
            sender: { id: 's2' },
            recipient: { id: 'r2' },
            timestamp: 12345,
            // No message object
          },
          {
            sender: { id: 's3' },
            recipient: { id: 'r3' },
            timestamp: 12345,
            message: { mid: 'm3', text: 'valid text' },
          },
        ],
      };

      const result = extractMessages(entry);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        senderId: 's3',
        recipientId: 'r3',
        messageId: 'm3',
        text: 'valid text',
        timestamp: 12345,
      });
    });
  });
});
