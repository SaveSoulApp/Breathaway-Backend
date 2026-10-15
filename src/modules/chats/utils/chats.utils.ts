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

/**
 * Resolves the counterpart participant ID from a chat room record given the current user's ID.
 *
 * @param room An object containing userOneId and userTwoId
 * @param currentUserId The ID of the current user
 * @returns The ID of the other user in the room
 */
export function getOtherParticipantId(
  room: { userOneId: string; userTwoId: string },
  currentUserId: string,
): string {
  return room.userOneId === currentUserId ? room.userTwoId : room.userOneId;
}

/**
 * Normalizes and clamps pagination limits within bounds.
 *
 * @param limit Optional requested limit
 * @param defaultLimit Fallback limit if unspecified (default: 20)
 * @param maxLimit Maximum upper bound (default: 100)
 * @returns Integer limit within [1, maxLimit]
 */
export function sanitizeLimit(
  limit?: number,
  defaultLimit = 20,
  maxLimit = 100,
): number {
  return Math.min(maxLimit, Math.max(1, limit ?? defaultLimit));
}
