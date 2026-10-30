import { prisma } from "../db/prisma.js";
import { ACTIVE_STATUSES, workerConfig } from "../config/worker.config.js";
import type { ScalerSettings } from "../config/autoscaler.config.js";

export type ScalerMetrics = {
  /** Deployments waiting to start. */
  queuedCount: number;
  /** How long the longest-waiting one has waited, or null if none are waiting. */
  oldestQueuedWaitSeconds: number | null;
  /** Workers currently holding a deployment. */
  busyWorkers: number;
  /** Worker processes currently running (including the primary one). */
  runningWorkers: number;
  /** For how long nothing has been waiting while a worker sat free, or null. */
  idleForSeconds: number | null;
  availableMemoryMb: number;
  /** Seconds since the autoscaler last started or stopped a worker, or null. */
  secondsSinceLastChange: number | null;
};

export type ScalerDecision = {
  action: "start" | "stop" | "none";
  reason: string;
};

/**
 * Decides whether to start or stop the extra worker. Pure: it only looks at the
 * numbers it is given, which keeps it easy to test.
 *
 * Scale up quickly (a user is waiting) and down slowly (avoid starting and
 * stopping a worker over and over).
 */
export function decideScaling(
  metrics: ScalerMetrics,
  settings: ScalerSettings,
): ScalerDecision {
  const {
    queuedCount,
    oldestQueuedWaitSeconds,
    busyWorkers,
    runningWorkers,
    idleForSeconds,
    availableMemoryMb,
    secondsSinceLastChange,
  } = metrics;

  if (
    secondsSinceLastChange !== null &&
    secondsSinceLastChange < settings.cooldownSeconds
  ) {
    return { action: "none", reason: "cooling down after the last change" };
  }

  const everyWorkerBusy = busyWorkers >= runningWorkers;

  if (
    queuedCount > 0 &&
    oldestQueuedWaitSeconds !== null &&
    oldestQueuedWaitSeconds >= settings.scaleUpAfterSeconds &&
    everyWorkerBusy
  ) {
    if (runningWorkers >= settings.maxWorkers) {
      return { action: "none", reason: "waiting, but already at the maximum" };
    }

    if (availableMemoryMb < settings.minFreeMemoryMb) {
      return {
        action: "none",
        reason: `waiting, but only ${Math.round(availableMemoryMb)} MB of memory is available`,
      };
    }

    return {
      action: "start",
      reason: `${queuedCount} waiting (oldest ${Math.round(oldestQueuedWaitSeconds)}s) and all ${runningWorkers} worker(s) busy`,
    };
  }

  if (
    runningWorkers > settings.minWorkers &&
    queuedCount === 0 &&
    idleForSeconds !== null &&
    idleForSeconds >= settings.scaleDownAfterIdleSeconds
  ) {
    return {
      action: "stop",
      reason: `nothing waiting and a worker idle for ${Math.round(idleForSeconds)}s`,
    };
  }

  return { action: "none", reason: "no change needed" };
}

/**
 * Reads queue numbers from Postgres only, so the autoscaler keeps working while
 * Redis is down. Rows past the max queue age are ignored: they are about to be
 * failed by the reaper, not run, so they are not real demand.
 */
export async function readQueueMetrics(now = new Date()) {
  const oldestAllowed = new Date(
    now.getTime() - workerConfig.maxQueueAgeSeconds * 1000,
  );

  const waiting = { status: "QUEUED", updatedAt: { gte: oldestAllowed } } as const;

  const [queuedCount, oldest, owners] = await Promise.all([
    prisma.deployment.count({ where: waiting }),
    prisma.deployment.findFirst({
      where: waiting,
      orderBy: { updatedAt: "asc" },
      select: { updatedAt: true },
    }),
    prisma.deployment.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        leasedUntil: { gt: now },
        workerId: { not: null },
      },
      distinct: ["workerId"],
      select: { workerId: true },
    }),
  ]);

  return {
    queuedCount,
    oldestQueuedWaitSeconds: oldest
      ? Math.max(0, (now.getTime() - oldest.updatedAt.getTime()) / 1000)
      : null,
    busyWorkers: owners.length,
  };
}
