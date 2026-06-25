/*
  Warnings:

  - You are about to drop the column `branch` on the `Deployment` table. All the data in the column will be lost.
  - You are about to drop the column `githubRepoUrl` on the `Deployment` table. All the data in the column will be lost.
  - Added the required column `projectId` to the `Deployment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Deployment" DROP COLUMN "branch",
DROP COLUMN "githubRepoUrl",
ADD COLUMN     "projectId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "githubRepoUrl" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
