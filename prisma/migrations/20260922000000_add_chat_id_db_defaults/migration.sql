-- AlterTable
ALTER TABLE "ChatRoom" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
