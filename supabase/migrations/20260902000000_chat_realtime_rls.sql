-- ══════════════════════════════════════════════════════════════════
-- Supabase-only: Realtime publication wiring + client RLS policies.
--
-- ⚠️  DO NOT add CREATE TABLE / ALTER TABLE here.
--     All DDL for ChatRoom and Message is owned exclusively by Prisma.
--     Prisma migrate deploy MUST run before supabase db push.
-- ══════════════════════════════════════════════════════════════════

-- 1. Wire both tables into Supabase Realtime
--    (tables already exist at this point, created by Prisma)
alter publication supabase_realtime add table "ChatRoom";
alter publication supabase_realtime add table "Message";

-- 2. Enable Row Level Security
ALTER TABLE public."ChatRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;

-- 3. Client RLS: users can only READ chat rooms they participate in
CREATE POLICY "Users can read their own chat rooms"
ON public."ChatRoom"
FOR SELECT
USING ((auth.jwt() ->> 'sub') = "userOneId" OR (auth.jwt() ->> 'sub') = "userTwoId");

-- 4. Client RLS: users can only READ messages in their chat rooms
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

