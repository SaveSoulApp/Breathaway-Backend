-- Add WITHDRAWN variant to LikeStatus enum.
-- This value already exists in the database; this migration brings
-- the local history into sync with the live schema.
ALTER TYPE "LikeStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';
