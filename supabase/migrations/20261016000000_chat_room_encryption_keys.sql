-- ══════════════════════════════════════════════════════════════════
-- Supabase-only: Add Room-Level DEK encryption columns to ChatRoom.
-- ══════════════════════════════════════════════════════════════════

-- For development: purge any legacy unencrypted dev rooms/messages
DELETE FROM public."Message" WHERE "roomId" IN (SELECT "id" FROM public."ChatRoom" WHERE "wrappedRoomKey" IS NULL);
DELETE FROM public."ChatRoom" WHERE "wrappedRoomKey" IS NULL;

ALTER TABLE public."ChatRoom"
ADD COLUMN IF NOT EXISTS "wrappedRoomKey" TEXT,
ADD COLUMN IF NOT EXISTS "roomKeyId" VARCHAR(64);

ALTER TABLE public."ChatRoom"
ALTER COLUMN "wrappedRoomKey" SET NOT NULL,
ALTER COLUMN "roomKeyId" SET NOT NULL;
