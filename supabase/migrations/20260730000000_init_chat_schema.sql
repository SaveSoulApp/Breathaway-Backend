-- 1. Create the decoupled ChatRoom table
CREATE TABLE public."ChatRoom" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "userOneId" text NOT NULL,
  "userTwoId" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE("userOneId", "userTwoId")
);

-- 2. Create the decoupled Message table
CREATE TABLE public."Message" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "roomId" uuid NOT NULL REFERENCES public."ChatRoom"("id") ON DELETE CASCADE,
  "senderId" text NOT NULL,
  "content" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "readAt" timestamp with time zone
);

-- 3. Enable Supabase Realtime for both tables
alter publication supabase_realtime add table "ChatRoom";
alter publication supabase_realtime add table "Message";

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public."ChatRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;

-- 5. Client RLS Policy: Users can only READ chat rooms they are a participant of
CREATE POLICY "Users can read their own chat rooms"
ON public."ChatRoom"
FOR SELECT
USING ((auth.jwt() ->> 'sub') = "userOneId" OR (auth.jwt() ->> 'sub') = "userTwoId");

-- 6. Client RLS Policy: Users can only READ messages in their chat rooms
CREATE POLICY "Users can read messages in their chat rooms"
ON public."Message"
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public."ChatRoom" 
    WHERE "ChatRoom"."id" = "Message"."roomId" 
    AND ((auth.jwt() ->> 'sub') = "ChatRoom"."userOneId" OR (auth.jwt() ->> 'sub') = "ChatRoom"."userTwoId")
  )
);
