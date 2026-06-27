/**
 * Generates the deterministic ordered participants for a chat room.
 * This is the single most critical invariant in the chat system.
 * The smaller ID is always userOneId, and the larger is always userTwoId.
 * This ensures the UNIQUE(userOneId, userTwoId) constraint works idempotently.
 *
 * @param id1 The ID of the first user
 * @param id2 The ID of the second user
 * @returns An object containing the sorted userOneId and userTwoId
 */
export function generateRoomParticipants(
  id1: string,
  id2: string,
): { userOneId: string; userTwoId: string } {
  return id1 < id2
    ? { userOneId: id1, userTwoId: id2 }
    : { userOneId: id2, userTwoId: id1 };
}
