import { redis } from "../lib/redis.js";

export const DEPLOYMENT_QUEUE = "deployment-queue";

export async function enqueueDeployment(deploymentId: string) {
  await redis.lPush(DEPLOYMENT_QUEUE, deploymentId);
}

export async function isDeploymentQueued(deploymentId: string) {
  return (await redis.lPos(DEPLOYMENT_QUEUE, deploymentId)) !== null;
}
