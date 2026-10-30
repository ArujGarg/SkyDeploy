import "./config/env.js";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";
import {
  autoscalerConfig,
  EXTRA_WORKER,
  PRIMARY_WORKER,
} from "./config/autoscaler.config.js";
import { prisma } from "./db/prisma.js";
import {
  decideScaling,
  readQueueMetrics,
} from "./services/autoscaler.service.js";
import { runHousekeeping } from "./services/retention.service.js";

const execFileAsync = promisify(execFile);

async function pm2(...args: string[]) {
  return execFileAsync("pm2", args, { maxBuffer: 10 * 1024 * 1024 });
}

/** How many of our worker processes pm2 currently has running. */
async function countRunningWorkers() {
  const { stdout } = await pm2("jlist");

  const processes = JSON.parse(stdout) as {
    name: string;
    pm2_env: { status: string };
  }[];

  return processes.filter(
    (process) =>
      (process.name === PRIMARY_WORKER || process.name === EXTRA_WORKER) &&
      process.pm2_env.status === "online",
  ).length;
}

async function readAvailableMemoryMb() {
  try {
    // "MemAvailable" is what can be used without swapping; os.freemem() would
    // count the disk cache as used and look much lower than it really is.
    const meminfo = await fs.readFile("/proc/meminfo", "utf8");
    const kb = Number(meminfo.match(/^MemAvailable:\s+(\d+)\s+kB/m)?.[1]);

    if (Number.isFinite(kb)) {
      return kb / 1024;
    }
  } catch {
    // Not Linux (e.g. a laptop); fall back below.
  }

  return os.freemem() / 1024 / 1024;
}

// First run one minute after start, then every housekeepingIntervalMinutes.
let nextHousekeepingAt = Date.now() + 60_000;
let housekeepingRunning = false;

function maybeRunHousekeeping() {
  if (housekeepingRunning || Date.now() < nextHousekeepingAt) {
    return;
  }

  housekeepingRunning = true;
  nextHousekeepingAt =
    Date.now() + autoscalerConfig.housekeepingIntervalMinutes * 60_000;

  // Not awaited: it can take a while and must not delay scaling decisions.
  runHousekeeping()
    .then((report) => {
      console.log(
        `Housekeeping: retried ${report.retried} stop(s), removed ${report.imagesRemoved} unused image(s)`,
      );
    })
    .catch((error) => console.error("Housekeeping failed", error))
    .finally(() => {
      housekeepingRunning = false;
    });
}

let lastChangeAt: number | null = null;
let idleSince: number | null = null;
let shuttingDown = false;

async function tick() {
  const now = Date.now();

  const [queue, runningWorkers, availableMemoryMb] = await Promise.all([
    readQueueMetrics(new Date(now)),
    countRunningWorkers(),
    readAvailableMemoryMb(),
  ]);

  // "Idle" means nothing is waiting while at least one worker has nothing to
  // do. Track for how long that has been true without interruption.
  const hasIdleWorker = queue.busyWorkers < runningWorkers;

  if (queue.queuedCount === 0 && hasIdleWorker) {
    idleSince ??= now;
  } else {
    idleSince = null;
  }

  const decision = decideScaling(
    {
      ...queue,
      runningWorkers,
      idleForSeconds: idleSince === null ? null : (now - idleSince) / 1000,
      availableMemoryMb,
      secondsSinceLastChange:
        lastChangeAt === null ? null : (now - lastChangeAt) / 1000,
    },
    autoscalerConfig,
  );

  if (decision.action === "none") {
    return;
  }

  console.log(
    `Autoscaler: ${decision.action} ${EXTRA_WORKER} (${decision.reason})`,
  );

  lastChangeAt = now;

  if (decision.action === "start") {
    await pm2("start", EXTRA_WORKER);

    return;
  }

  // Stopping is graceful: pm2 sends SIGINT and the worker finishes the
  // deployment it is on first. The command only returns once the worker has
  // exited, which can take minutes, so it is not awaited.
  pm2("stop", EXTRA_WORKER).catch((error) => {
    console.error(`Failed to stop ${EXTRA_WORKER}`, error);
  });
}

async function run() {
  console.log(
    `Autoscaler started (workers ${autoscalerConfig.minWorkers} to ${autoscalerConfig.maxWorkers}, checking every ${autoscalerConfig.checkIntervalSeconds}s)`,
  );

  process.on("SIGINT", () => (shuttingDown = true));
  process.on("SIGTERM", () => (shuttingDown = true));

  while (!shuttingDown) {
    maybeRunHousekeeping();

    try {
      await tick();
    } catch (error) {
      // Postgres or pm2 unreachable: change nothing and try again next time.
      console.error("Autoscaler check failed:", error);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, autoscalerConfig.checkIntervalSeconds * 1000),
    );
  }

  await prisma.$disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
