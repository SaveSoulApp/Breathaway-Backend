import { generateRoomParticipants } from '../utils/chats.utils';

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
});
