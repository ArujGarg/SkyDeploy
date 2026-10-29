import { workerConfig } from "../config/worker.config.js";
import { claimDeployment, claimNextQueued } from "./lease.service.js";

// The part of the Redis client the worker needs, so it can be tested.
export type BlockingQueue = {
  readonly isReady: boolean;
  pop(timeoutSeconds: number): Promise<string | null>;
};

export type ClaimedJob = { deploymentId: string; attempt: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns the next deployment this worker has claimed, or null if there was
 * nothing to do this time round (the caller just loops again).
 *
 * Redis is the fast path: wait on the list for an id. If Redis is unreachable
 * or errors, ask Postgres for the oldest QUEUED deployment instead. Either
 * way ownership is decided by the same atomic claim in Postgres, so it does
 * not matter which path found the id.
 */
export async function waitForNextJob(
  queue: BlockingQueue,
  idleDelayMs = workerConfig.queuePollTimeoutSeconds * 1000,
): Promise<ClaimedJob | null> {
  if (queue.isReady) {
    try {
      const deploymentId = await queue.pop(
        workerConfig.queuePollTimeoutSeconds,
      );

      // Timed out with an empty queue: nothing to do, check for shutdown.
      if (!deploymentId) {
        return null;
      }

      const attempt = await claimDeployment(deploymentId);

      if (attempt === null) {
        console.log(
          `Deployment ${deploymentId} is not queued any more (taken or finished), skipping`,
        );

        return null;
      }

      return { deploymentId, attempt };
    } catch (error) {
      // Redis dropped while waiting (a claim error is a Postgres problem and
      // is also safe to retry through the fallback below). Do not exit.
      console.error(
        `Waiting on the queue failed, checking Postgres instead: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  const claimed = await claimNextQueued();

  if (claimed) {
    return claimed;
  }

  // Nothing waiting. Without Redis there is no blocking wait to pace the
  // loop, so pause here instead of spinning.
  if (!queue.isReady) {
    await sleep(idleDelayMs);
  }

  return null;
}
