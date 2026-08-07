ALTER TABLE "User" ALTER COLUMN "phoneE164" DROP NOT NULL;

CREATE TABLE "AdminCredential" (
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustRotatePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminCredential_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "Call" ADD COLUMN "roomName" TEXT;
ALTER TABLE "VideoRecording" ADD COLUMN "egressId" TEXT;
ALTER TABLE "VideoRecording" ADD COLUMN "roomName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "VideoRecording" ADD COLUMN "errorMessage" TEXT;

CREATE UNIQUE INDEX "AdminCredential_username_key" ON "AdminCredential"("username");
CREATE INDEX "AdminCredential_username_idx" ON "AdminCredential"("username");
CREATE UNIQUE INDEX "Call_roomName_key" ON "Call"("roomName");
CREATE UNIQUE INDEX "VideoRecording_egressId_key" ON "VideoRecording"("egressId");
CREATE INDEX "VideoRecording_egressId_idx" ON "VideoRecording"("egressId");

ALTER TABLE "AdminCredential" ADD CONSTRAINT "AdminCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
