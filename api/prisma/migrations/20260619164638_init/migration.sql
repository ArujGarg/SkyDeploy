-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('QUEUED', 'CLONING', 'BUILDING', 'DEPLOYING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "githubRepoUrl" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "status" "DeploymentStatus" NOT NULL,
    "imageTag" TEXT,
    "deployedUrl" TEXT,
    "buildLogs" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);
