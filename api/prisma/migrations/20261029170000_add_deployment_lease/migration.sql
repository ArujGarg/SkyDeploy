-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leasedUntil" TIMESTAMP(3),
ADD COLUMN     "workerId" TEXT;

-- CreateIndex
CREATE INDEX "Deployment_status_leasedUntil_idx" ON "Deployment"("status", "leasedUntil");
