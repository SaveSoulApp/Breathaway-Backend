-- ══════════════════════════════════════════════════════════════════
-- BreathAway Chat: Supabase Realtime Publication, RLS & Encryption Setup
--
-- ⚠️  DO NOT add CREATE TABLE here.
--     Table DDL for ChatRoom and Message is owned by Prisma.
--     Prisma migrations (init) MUST run before applying this script.
-- ══════════════════════════════════════════════════════════════════

-- 1. Ensure room-level encryption columns exist on ChatRoom (defensive check)
ALTER TABLE public."ChatRoom"
ADD COLUMN IF NOT EXISTS "wrappedRoomKey" TEXT,
ADD COLUMN IF NOT EXISTS "roomKeyId" VARCHAR(64);

-- 2. Wire ChatRoom and Message into Supabase Realtime logical replication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ChatRoom'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."ChatRoom";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'Message'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Message";
  END IF;
END $$;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public."ChatRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;

-- 4. Client RLS: Users can only READ chat rooms they participate in
DROP POLICY IF EXISTS "Users can read their own chat rooms" ON public."ChatRoom";
CREATE POLICY "Users can read their own chat rooms"
ON public."ChatRoom"
FOR SELECT
USING ((auth.jwt() ->> 'sub') = "userOneId" OR (auth.jwt() ->> 'sub') = "userTwoId");

-- 5. Client RLS: Users can only READ messages in their chat rooms
DROP POLICY IF EXISTS "Users can read messages in their chat rooms" ON public."Message";
CREATE POLICY "Users can read messages in their chat rooms"
ON public."Message"
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public."ChatRoom"
    WHERE "ChatRoom"."id" = "Message"."roomId"
    AND (
      (auth.jwt() ->> 'sub') = "ChatRoom"."userOneId"
      OR (auth.jwt() ->> 'sub') = "ChatRoom"."userTwoId"
    )
  )
);
