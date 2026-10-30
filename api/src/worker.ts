import "./config/env.js";

import { workerConfig } from "./config/worker.config.js";
import { prisma } from "./db/prisma.js";
import {
  closeRedis,
  connectRedis,
  createBlockingRedisClient,
  redis,
} from "./lib/redis.js";
import {
  cleanupDeploymentResources,
  cleanupWorkspace,
  workspaceNameFor,
} from "./services/cleanup.service.js";
import { hasDockerfile } from "./services/deployment.service.js";
import {
  buildImage,
  getExposedPort,
  getPublishedPort,
  isContainerRunning,
  runContainer,
  stopAndRemoveContainer,
} from "./services/docker.service.js";
import { cloneRepository } from "./services/git.service.js";
import { waitForHealthCheck } from "./services/health.service.js";
import {
  LeaseLostError,
  startLease,
  updateOwned,
  WORKER_ID,
} from "./services/lease.service.js";
import { addDeploymentLog } from "./services/log.service.js";
import {
  createNginxConfig,
  reloadNginx,
  subdomainFor,
} from "./services/nginx.service.js";
import { waitForNextJob } from "./services/job-source.service.js";
import { DEPLOYMENT_QUEUE } from "./services/queue.service.js";
import { startReaper } from "./services/reaper.service.js";

// Graceful shutdown: a stop signal only sets this flag. The loop checks it
// between jobs, so the job in progress always runs to completion.
let shuttingDown = false;

function requestShutdown(signal: string) {
  if (shuttingDown) {
    console.log(`Received ${signal} again, exiting immediately`);
    process.exit(1);
  }

  shuttingDown = true;
  console.log(
    `Received ${signal}, finishing the current job before shutting down`,
  );
}

process.on("SIGINT", () => requestShutdown("SIGINT"));
process.on("SIGTERM", () => requestShutdown("SIGTERM"));

// A blocking BRPOP holds its connection, so it gets its own client. Sharing
// one would make the reaper's Redis commands wait behind it.
const blockingRedis = createBlockingRedisClient();

// The deployment has already been claimed by this worker (see
// job-source.service.ts) before this runs.
async function processDeployment(deploymentId: string, attempt: number) {
  const lease = startLease(deploymentId, attempt);
  const workspaceName = workspaceNameFor(deploymentId, attempt);

  let containerId: string | null = null;

  try {
    await addDeploymentLog(
      deploymentId,
      "QUEUE",
      `Deployment picked up by worker (attempt ${attempt} of ${workerConfig.maxAttempts})`,
    );

    if (attempt > 1) {
      // A previous attempt died and may have left things behind. Start clean
      // so this attempt does not trip over them.
      const removed = await cleanupDeploymentResources(deploymentId);

      await addDeploymentLog(
        deploymentId,
        "CLEANUP",
        removed.length > 0
          ? `Removed leftovers from the previous attempt: ${removed.join(", ")}`
          : "No leftovers from the previous attempt",
      );
    }

    const deployment = await prisma.deployment.findUnique({
      where: {
        id: deploymentId,
      },
      include: {
        project: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    // The claim already moved the status to CLONING.
    await addDeploymentLog(
      deploymentId,
      "CLONING",
      `Cloning repository ${deployment.githubRepoUrl}`,
    );

    const githubAccount = await prisma.account.findFirst({
      where: {
        userId: deployment.project.userId,
        provider: "github",
      },
      select: {
        access_token: true,
      },
    });

    const accessToken = githubAccount?.access_token ?? null;

    const targetDir = await cloneRepository(
      deployment.githubRepoUrl,
      workspaceName,
      {
        accessToken,
      },
    );

    await addDeploymentLog(
      deploymentId,
      "CLONING",
      "Repository cloned successfully",
    );

    console.log(`Repository cloned to ${targetDir}`);

    if (!hasDockerfile(workspaceName)) {
      throw new Error("Dockerfile not found");
    }

    lease.check();
    await updateOwned(deploymentId, attempt, { status: "BUILDING" });

    await addDeploymentLog(deploymentId, "BUILDING", "Building Docker image");

    const imageTag = await buildImage(deployment.id, workspaceName);

    await addDeploymentLog(
      deploymentId,
      "BUILDING",
      `Docker image built successfully (${imageTag})`,
    );

    console.log(`Built image ${imageTag}`);

    lease.check();
    await updateOwned(deploymentId, attempt, { status: "DEPLOYING", imageTag });

    const containerPort = await getExposedPort(imageTag);

    await addDeploymentLog(deploymentId, "DEPLOYING", "Starting container");

    // Last chance to notice we lost the job before creating something that
    // outlives this attempt.
    lease.check();

    containerId = await runContainer(
      deploymentId,
      attempt,
      imageTag,
      containerPort,
    );

    console.log(`Started container ${containerId}`);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const running = await isContainerRunning(containerId);

    if (!running) {
      console.log("Container exited immediately after startup");
      throw new Error("Container exited immediately after startup");
    }

    const hostPort = await getPublishedPort(containerId, containerPort);

    await addDeploymentLog(
      deploymentId,
      "DEPLOYING",
      `Container started on host port ${hostPort} (${containerId})`,
    );

    console.log("container is running");

    await addDeploymentLog(
      deploymentId,
      "HEALTH_CHECK",
      "Checking application health",
    );

    const healthy = await waitForHealthCheck(hostPort);

    if (!healthy) {
      throw new Error(
        `Application failed health check after 30 seconds on port ${containerPort}`,
      );
    }

    await addDeploymentLog(
      deploymentId,
      "HEALTH_CHECK",
      "Application passed health check",
    );

    console.log("Containter is healthy and listening");

    lease.check();

    const subdomain = subdomainFor(deployment.id);

    await createNginxConfig(subdomain, hostPort);

    await addDeploymentLog(
      deploymentId,
      "NGINX",
      `Created nginx route ${subdomain}.aruj.dev`,
    );

    await reloadNginx();

    await addDeploymentLog(deploymentId, "NGINX", "Reloaded nginx");

    // SUCCESS is only recorded once the app is reachable. Marking it earlier
    // would leave a "successful" deployment with no route if we died here.
    await updateOwned(deploymentId, attempt, {
      status: "SUCCESS",
      imageTag,
      containerId,
      hostPort,
      subdomain,
      deployedUrl: `http://${subdomain}.aruj.dev`,
      completedAt: new Date(),
      leasedUntil: null,
    });

    await addDeploymentLog(
      deploymentId,
      "SUCCESS",
      `Deployment available at http://${subdomain}.aruj.dev`,
    );

    console.log(`Application available at http://localhost:${hostPort}`);
  } catch (error) {
    if (error instanceof LeaseLostError || lease.isLost()) {
      // Another attempt owns this deployment now. Leave its shared state
      // (status, image, nginx route, logs) alone; remove only the container
      // this attempt itself started.
      console.error(
        `Attempt ${attempt} of ${deploymentId} lost its lease, stopping`,
      );

      if (containerId) {
        await stopAndRemoveContainer(containerId);
      }

      return;
    }

    console.error(`Failed processing ${deploymentId}`, error);

    const message = error instanceof Error ? error.message : "Unknown error";

    try {
      await addDeploymentLog(deploymentId, "ERROR", message);

      // Fenced: if we lost ownership without noticing, this throws and we
      // skip the cleanup below so we cannot delete the newer attempt's work.
      await updateOwned(deploymentId, attempt, {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
        leasedUntil: null,
      });

      const removed = await cleanupDeploymentResources(deploymentId);

      if (removed.length > 0) {
        await addDeploymentLog(
          deploymentId,
          "CLEANUP",
          `Removed failed deployment resources: ${removed.join(", ")}`,
        );
      }
    } catch (failureError) {
      if (!(failureError instanceof LeaseLostError)) {
        console.error(
          `Failed to record failure of ${deploymentId}`,
          failureError,
        );
      }
    }
  } finally {
    lease.stop();

    try {
      await cleanupWorkspace(workspaceName);
    } catch (error) {
      console.error("Failed to cleanup workspace", error);
    }
  }
}

async function startWorker() {
  // Both connect in the background: the worker must start, and keep finding
  // work in Postgres, even while Redis is down.
  connectRedis();
  connectRedis(blockingRedis);

  console.log(`Worker ${WORKER_ID} started`);

  const reaper = startReaper();

  const queue = {
    get isReady() {
      return blockingRedis.isReady;
    },
    async pop(timeoutSeconds: number) {
      // Waiting here instead of closing the connection to interrupt it is what
      // makes a shutdown request safe: no job can be lost mid-pop.
      const result = await blockingRedis.brPop(DEPLOYMENT_QUEUE, timeoutSeconds);

      return result?.element ?? null;
    },
  };

  let errorDelayMs = 0;

  while (!shuttingDown) {
    try {
      const job = await waitForNextJob(queue);

      errorDelayMs = 0;

      if (!job) {
        continue;
      }

      console.log(`Received deployment ${job.deploymentId}`);

      await processDeployment(job.deploymentId, job.attempt);
    } catch (error) {
      // Typically Postgres being unreachable. Anything still QUEUED is found
      // again later, so just back off (1s, 2s, ... up to 30s) and carry on.
      errorDelayMs = Math.min(Math.max(errorDelayMs * 2, 1000), 30_000);

      console.error(
        `Worker loop error (retrying in ${errorDelayMs / 1000}s):`,
        error,
      );

      await new Promise((resolve) => setTimeout(resolve, errorDelayMs));
    }
  }

  console.log("Worker shutting down");

  reaper.stop();
  await closeRedis(blockingRedis);
  await closeRedis(redis);
  await prisma.$disconnect();
}

startWorker()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
