import { redis } from "../lib/redis.js";

export const DEPLOYMENT_QUEUE = "deployment-queue";

/**
 * Adds a deployment id to the Redis list so a worker picks it up quickly.
 * Returns false (without waiting, and without throwing) when Redis is
 * unreachable. That is not an error for the caller: the deployment is already
 * saved as QUEUED in Postgres, and workers and the reaper find it there.
 */
export async function enqueueDeployment(deploymentId: string) {
  if (!redis.isReady) {
    return false;
  }

  try {
    await redis.lPush(DEPLOYMENT_QUEUE, deploymentId);

    return true;
  } catch (error) {
    console.error(
      `Could not add ${deploymentId} to the queue: ${error instanceof Error ? error.message : error}`,
    );

    return false;
  }
}

export async function isDeploymentQueued(deploymentId: string) {
  return (await redis.lPos(DEPLOYMENT_QUEUE, deploymentId)) !== null;
}
