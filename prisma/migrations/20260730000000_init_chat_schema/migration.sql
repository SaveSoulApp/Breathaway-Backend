-- Prisma baseline migration for ChatRoom and Message tables.
-- Describes the exact schema created by the original Supabase SQL migration.
--
-- NOT included here (intentionally):
--   - supabase_realtime publication → supabase/migrations/ only
--   - RLS policies → supabase/migrations/ only
--   - Explicit indexes on userOneId/userTwoId → managed by subsequent Prisma migrations
--   - FK on Message.roomId → managed by subsequent Prisma migrations

CREATE TABLE public."ChatRoom" (
  "id"        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "userOneId" text NOT NULL,
  "userTwoId" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE ("userOneId", "userTwoId")
);

CREATE TABLE public."Message" (
  "id"        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "roomId"    uuid NOT NULL,
  "senderId"  text NOT NULL,
  "content"   text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "readAt"    timestamp with time zone
);
