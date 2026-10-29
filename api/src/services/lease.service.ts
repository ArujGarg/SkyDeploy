import os from "node:os";
import { randomBytes } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { ACTIVE_STATUSES, workerConfig } from "../config/worker.config.js";
import { Prisma } from "../generated/prisma/client.js";

// Identifies this worker process. Stored on the deployment while it owns it.
export const WORKER_ID = `${os.hostname()}:${process.pid}:${randomBytes(2).toString("hex")}`;

/** Thrown when another worker (or the reaper) took the deployment from us. */
export class LeaseLostError extends Error {
  constructor(deploymentId: string, attempt: number) {
    super(
      `Lost ownership of deployment ${deploymentId} (attempt ${attempt})`,
    );
    this.name = "LeaseLostError";
  }
}

function leaseExpiry() {
  return new Date(Date.now() + workerConfig.leaseSeconds * 1000);
}

/**
 * Tries to take ownership of a QUEUED deployment. This is one conditional
 * UPDATE (`WHERE id = ? AND status = 'QUEUED'`), so when two workers race the
 * database lets exactly one of them match. The other gets "record not found".
 * Returns the new attempt number, or null if someone else already has it.
 */
export async function claimDeployment(deploymentId: string) {
  try {
    const claimed = await prisma.deployment.update({
      where: { id: deploymentId, status: "QUEUED" },
      data: {
        status: "CLONING",
        workerId: WORKER_ID,
        attempts: { increment: 1 },
        leasedUntil: leaseExpiry(),
      },
      select: { attempts: true },
    });

    return claimed.attempts;
  } catch (error) {
    // P2025: no row matched, i.e. it is no longer QUEUED.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return null;
    }

    throw error;
  }
}

/** Pushes the lease forward. False means we no longer own the deployment. */
async function extendLease(deploymentId: string, attempt: number) {
  const { count } = await prisma.deployment.updateMany({
    where: {
      id: deploymentId,
      workerId: WORKER_ID,
      attempts: attempt,
      status: { in: ACTIVE_STATUSES },
    },
    data: { leasedUntil: leaseExpiry() },
  });

  return count === 1;
}

type DeploymentUpdate = Parameters<
  typeof prisma.deployment.updateMany
>[0]["data"];

/**
 * Fenced update: only applies if we still own this attempt. This is what
 * stops a worker that was frozen (and already replaced) from overwriting the
 * newer attempt's progress. Throws LeaseLostError when nothing matched.
 */
export async function updateOwned(
  deploymentId: string,
  attempt: number,
  data: DeploymentUpdate,
) {
  const { count } = await prisma.deployment.updateMany({
    where: { id: deploymentId, workerId: WORKER_ID, attempts: attempt },
    data,
  });

  if (count === 0) {
    throw new LeaseLostError(deploymentId, attempt);
  }
}

export type Lease = {
  /** Throws if ownership was lost or the attempt ran past its time limit. */
  check(): void;
  isLost(): boolean;
  stop(): void;
};

/** Starts the heartbeat that keeps this worker's claim alive. */
export function startLease(deploymentId: string, attempt: number): Lease {
  let lost = false;
  const deadline = Date.now() + workerConfig.attemptTimeoutMs;

  const timer = setInterval(async () => {
    try {
      if (!(await extendLease(deploymentId, attempt))) {
        lost = true;
        clearInterval(timer);
        console.error(
          `Lease for deployment ${deploymentId} (attempt ${attempt}) was lost`,
        );
      }
    } catch (error) {
      // A database blip: keep trying. If the lease really expired meanwhile,
      // the next successful beat returns false and we find out then.
      console.error("Failed to extend lease", error);
    }
  }, workerConfig.heartbeatSeconds * 1000);

  return {
    check() {
      if (lost) {
        throw new LeaseLostError(deploymentId, attempt);
      }

      if (Date.now() > deadline) {
        throw new Error(
          `Deployment attempt exceeded the maximum duration of ${workerConfig.attemptTimeoutMs / 60_000} minutes`,
        );
      }
    },
    isLost: () => lost,
    stop: () => clearInterval(timer),
  };
}
