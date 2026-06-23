// services/log.service.ts

import { prisma } from "../db/prisma.js";

export async function addDeploymentLog(
  deploymentId: string,
  stage: string,
  message: string,
) {
  await prisma.deploymentLog.create({
    data: {
      deploymentId,
      stage,
      message,
    },
  });
}
