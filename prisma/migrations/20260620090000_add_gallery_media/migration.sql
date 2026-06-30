CREATE TABLE "GalleryMedia" (
  "id" SERIAL NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'Memories',
  "mediaType" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedById" INTEGER NOT NULL,

  CONSTRAINT "GalleryMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GalleryMedia_createdAt_idx" ON "GalleryMedia"("createdAt");

ALTER TABLE "GalleryMedia"
ADD CONSTRAINT "GalleryMedia_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
