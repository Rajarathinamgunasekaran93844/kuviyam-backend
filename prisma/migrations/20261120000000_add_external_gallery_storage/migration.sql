ALTER TABLE "GalleryMedia"
  ALTER COLUMN "data" DROP NOT NULL;

ALTER TABLE "GalleryMedia"
  ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'DATABASE',
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "externalUrl" TEXT,
  ADD COLUMN "providerUploadId" TEXT,
  ADD COLUMN "providerAssetId" TEXT,
  ADD COLUMN "playbackId" TEXT,
  ADD COLUMN "assetStatus" TEXT;

CREATE UNIQUE INDEX "GalleryMedia_providerUploadId_key"
  ON "GalleryMedia"("providerUploadId");

CREATE UNIQUE INDEX "GalleryMedia_providerAssetId_key"
  ON "GalleryMedia"("providerAssetId");
