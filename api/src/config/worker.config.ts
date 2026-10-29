import "./env.js";
import type { DeploymentStatus } from "../generated/prisma/client.js";

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Tunables for job ownership and recovery. See docs/DESIGN_DECISIONS.md.
export const workerConfig = {
  // A worker owns a job for this long, and must extend it before it runs out.
  leaseSeconds: numberFromEnv("LEASE_SECONDS", 60),
  // How often a working worker extends its lease (three beats per lease).
  heartbeatSeconds: numberFromEnv("HEARTBEAT_SECONDS", 20),
  // A deployment is started at most this many times before it is failed.
  maxAttempts: numberFromEnv("MAX_ATTEMPTS", 3),
  // How often each worker looks for abandoned jobs.
  reaperIntervalSeconds: numberFromEnv("REAPER_INTERVAL_SECONDS", 30),
  // A QUEUED row older than this that is missing from Redis gets pushed again.
  staleQueuedSeconds: numberFromEnv("STALE_QUEUED_SECONDS", 30),
  // A deployment still QUEUED after this long is failed, not retried forever.
  maxQueueAgeSeconds: numberFromEnv("MAX_QUEUE_AGE_SECONDS", 60 * 60),
  // How long an idle worker waits on the queue before checking for shutdown.
  queuePollTimeoutSeconds: numberFromEnv("QUEUE_POLL_TIMEOUT_SECONDS", 5),
  cloneTimeoutMs: numberFromEnv("CLONE_TIMEOUT_MS", 2 * 60_000),
  buildTimeoutMs: numberFromEnv("BUILD_TIMEOUT_MS", 10 * 60_000),
  // Upper bound for one whole attempt, checked between stages.
  attemptTimeoutMs: numberFromEnv("ATTEMPT_TIMEOUT_MS", 20 * 60_000),
};


// Statuses in which a worker is expected to be holding a lease.
export const ACTIVE_STATUSES: DeploymentStatus[] = [
  "CLONING",
  "BUILDING",
  "DEPLOYING",
];
