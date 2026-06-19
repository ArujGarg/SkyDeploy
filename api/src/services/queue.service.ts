import { redis } from "../lib/redis.js";

const DEPLOYMENT_QUEUE = "deployment-queue";

export async function enqueueDeployment(deploymentId: string) {
  await redis.lPush(DEPLOYMENT_QUEUE, deploymentId);
}
