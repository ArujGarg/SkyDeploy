import { prisma } from "../db/prisma.js";
import { ACTIVE_STATUSES, workerConfig } from "../config/worker.config.js";
import { cleanupDeploymentResources } from "./cleanup.service.js";
import { addDeploymentLog } from "./log.service.js";
import { enqueueDeployment, isDeploymentQueued } from "./queue.service.js";

// The reaper finds deployments that are stuck because nobody is working on
// them any more, and either retries or fails them. Postgres is the source of
// truth; Redis is only told "there is work", so everything here is safe to
// repeat. Each state change is a conditional update (`WHERE` repeats the state
// we just observed), so if two reapers race, only one of them changes the row.

export type ReaperQueue = {
  isQueued(deploymentId: string): Promise<boolean>;
  enqueue(deploymentId: string): Promise<void>;
};

const redisQueue: ReaperQueue = {
  isQueued: isDeploymentQueued,
  enqueue: enqueueDeployment,
};

export type ReaperResult = {
  requeued: string[];
  failed: string[];
  expiredInQueue: string[];
  repushed: string[];
};

function secondsAgo(seconds: number) {
  return new Date(Date.now() - seconds * 1000);
}

export async function reapOnce(
  queue: ReaperQueue = redisQueue,
): Promise<ReaperResult> {
  const result: ReaperResult = {
    requeued: [],
    failed: [],
    expiredInQueue: [],
    repushed: [],
  };

  const { maxAttempts, staleQueuedSeconds, maxQueueAgeSeconds } = workerConfig;

  // 1. Active deployments whose owner stopped sending heartbeats. Rows with no
  //    lease at all (from before leases existed) never match `lt`, because a
  //    comparison with NULL is never true.
  const now = new Date();

  const abandoned = await prisma.deployment.findMany({
    where: { status: { in: ACTIVE_STATUSES }, leasedUntil: { lt: now } },
    select: { id: true, attempts: true },
  });

  for (const deployment of abandoned) {
    // Same conditions as the query above: if the owner extended its lease in
    // the meantime (it was only slow), nothing matches and we leave it alone.
    const stillAbandoned = {
      id: deployment.id,
      status: { in: ACTIVE_STATUSES },
      leasedUntil: { lt: now },
    };

    if (deployment.attempts >= maxAttempts) {
      const message = `Worker stopped responding and the retry limit (${maxAttempts} attempts) was reached`;

      const { count } = await prisma.deployment.updateMany({
        where: stillAbandoned,
        data: {
          status: "FAILED",
          errorMessage: message,
          completedAt: new Date(),
          leasedUntil: null,
        },
      });

      if (count === 1) {
        result.failed.push(deployment.id);
        await addDeploymentLog(deployment.id, "ERROR", message);

        const removed = await cleanupDeploymentResources(deployment.id);

        if (removed.length > 0) {
          await addDeploymentLog(
            deployment.id,
            "CLEANUP",
            `Removed leftovers: ${removed.join(", ")}`,
          );
        }
      }

      continue;
    }

    const { count } = await prisma.deployment.updateMany({
      where: stillAbandoned,
      data: { status: "QUEUED", workerId: null, leasedUntil: null },
    });

    if (count === 1) {
      result.requeued.push(deployment.id);

      await addDeploymentLog(
        deployment.id,
        "RETRY",
        `Worker stopped responding during attempt ${deployment.attempts} of ${maxAttempts}; queueing a retry`,
      );

      try {
        await queue.enqueue(deployment.id);
      } catch (error) {
        // The row is QUEUED in Postgres, so step 3 below picks it up later.
        console.error(`Failed to enqueue ${deployment.id} for retry`, error);
      }
    }
  }

  // 2. Deployments that have been QUEUED for too long are failed, not retried
  //    forever.
  const tooOld = secondsAgo(maxQueueAgeSeconds);

  const waitedTooLong = await prisma.deployment.findMany({
    where: { status: "QUEUED", updatedAt: { lt: tooOld } },
    select: { id: true },
  });

  for (const { id } of waitedTooLong) {
    const { count } = await prisma.deployment.updateMany({
      where: { id, status: "QUEUED", updatedAt: { lt: tooOld } },
      data: {
        status: "FAILED",
        errorMessage: "Deployment expired while waiting in the queue",
        completedAt: new Date(),
      },
    });

    if (count === 1) {
      result.expiredInQueue.push(id);
      await addDeploymentLog(
        id,
        "ERROR",
        "Deployment expired while waiting in the queue",
      );
    }
  }

  // 3. QUEUED rows that are not actually in Redis (a worker died between
  //    popping the id and claiming it, or Redis lost it): push them again.
  //    Checking first avoids piling up duplicates for jobs that are just
  //    waiting their turn behind a long queue.
  const stale = await prisma.deployment.findMany({
    where: {
      status: "QUEUED",
      updatedAt: { lt: secondsAgo(staleQueuedSeconds) },
    },
    select: { id: true },
  });

  for (const { id } of stale) {
    try {
      if (!(await queue.isQueued(id))) {
        await queue.enqueue(id);
        result.repushed.push(id);
        await addDeploymentLog(
          id,
          "QUEUE",
          "Deployment was missing from the queue; queued it again",
        );
      }
    } catch (error) {
      console.error(`Failed to re-queue ${id}`, error);
    }
  }

  return result;
}

/** Runs the reaper now and then on an interval. Returns a stop function. */
export function startReaper(queue: ReaperQueue = redisQueue) {
  let running = false;

  async function tick() {
    // Never overlap with a previous run that is still going.
    if (running) {
      return;
    }

    running = true;

    try {
      const result = await reapOnce(queue);

      if (
        result.requeued.length ||
        result.failed.length ||
        result.expiredInQueue.length ||
        result.repushed.length
      ) {
        console.log("Reaper:", JSON.stringify(result));
      }
    } catch (error) {
      console.error("Reaper run failed", error);
    } finally {
      running = false;
    }
  }

  void tick();
  const timer = setInterval(tick, workerConfig.reaperIntervalSeconds * 1000);

  return { stop: () => clearInterval(timer) };
}
