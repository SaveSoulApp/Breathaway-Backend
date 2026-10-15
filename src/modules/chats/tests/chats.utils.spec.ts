import {
  generateRoomParticipants,
  getOtherParticipantId,
  sanitizeLimit,
} from '../utils/chats.utils';

describe('ChatsUtils', () => {
  describe('generateRoomParticipants', () => {
    it('should sort IDs so userOneId is always the smaller one', () => {
      const id1 = 'B-User';
      const id2 = 'A-User';

      const result = generateRoomParticipants(id1, id2);

      expect(result.userOneId).toBe('A-User');
      expect(result.userTwoId).toBe('B-User');
    });

    it('should handle IDs already in the correct order', () => {
      const id1 = '1-User';
      const id2 = '2-User';

      const result = generateRoomParticipants(id1, id2);

      expect(result.userOneId).toBe('1-User');
      expect(result.userTwoId).toBe('2-User');
    });

    it('should handle identical IDs gracefully', () => {
      const id = 'Same-User';
      const result = generateRoomParticipants(id, id);

      expect(result.userOneId).toBe(id);
      expect(result.userTwoId).toBe(id);
    });
  });

  describe('getOtherParticipantId', () => {
    it('should return userTwoId when current user is userOneId', () => {
      const room = { userOneId: 'user-alpha', userTwoId: 'user-beta' };
      expect(getOtherParticipantId(room, 'user-alpha')).toBe('user-beta');
    });

    it('should return userOneId when current user is userTwoId', () => {
      const room = { userOneId: 'user-alpha', userTwoId: 'user-beta' };
      expect(getOtherParticipantId(room, 'user-beta')).toBe('user-alpha');
    });
  });

  describe('sanitizeLimit', () => {
    it('should return defaultLimit when limit is undefined', () => {
      expect(sanitizeLimit()).toBe(20);
      expect(sanitizeLimit(undefined, 50)).toBe(50);
    });

    it('should clamp limit to minimum of 1', () => {
      expect(sanitizeLimit(0)).toBe(1);
      expect(sanitizeLimit(-10)).toBe(1);
    });

    it('should clamp limit to maxLimit', () => {
      expect(sanitizeLimit(150)).toBe(100);
      expect(sanitizeLimit(50, 20, 30)).toBe(30);
    });

    it('should return valid requested limit within bounds', () => {
      expect(sanitizeLimit(42)).toBe(42);
    });
  });
});
