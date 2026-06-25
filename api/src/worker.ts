import "./config/env.js";

import { prisma } from "./db/prisma.js";
import { connectRedis, redis } from "./lib/redis.js";
import { cleanupWorkspace } from "./services/cleanup.service.js";
import { hasDockerfile } from "./services/deployment.service.js";
import {
  buildImage,
  getExposedPort,
  isContainerRunning,
  removeImage,
  runContainer,
  stopAndRemoveContainer,
} from "./services/docker.service.js";
import { cloneRepository } from "./services/git.service.js";
import { waitForHealthCheck } from "./services/health.service.js";
import { addDeploymentLog } from "./services/log.service.js";
import {
  createNginxConfig,
  deleteNginxConfig,
  reloadNginx,
} from "./services/nginx.service.js";
import { getAvailablePort } from "./utils/port.util.js";

const DEPLOYMENT_QUEUE = "deployment-queue";

async function startWorker() {
  await connectRedis();

  console.log("Worker started");

  while (true) {
    // wait for next job
    const result = await redis.brPop(DEPLOYMENT_QUEUE, 0);

    const deploymentId = result?.element;
    if (!deploymentId) {
      continue;
    }
    console.log(`Received deployment ${deploymentId}`);

    await addDeploymentLog(
      deploymentId,
      "QUEUE",
      "Deployment picked up by worker",
    );

    let imageTag: string | null = null;
    let containerId: string | null = null;
    let subdomain: string | null = null;

    try {
      const deployment = await prisma.deployment.findUnique({
        where: {
          id: deploymentId,
        },
      });

      if (!deployment) {
        console.error(`Deployment ${deploymentId} not found`);

        continue;
      }

      console.log(deployment);

      await prisma.deployment.update({
        where: {
          id: deploymentId,
        },
        data: {
          status: "CLONING",
        },
      });

      await addDeploymentLog(
        deploymentId,
        "CLONING",
        `Cloning repository ${deployment.githubRepoUrl}`,
      );

      const targetDir = await cloneRepository(
        deployment.githubRepoUrl,
        deployment.id,
      );

      await addDeploymentLog(
        deploymentId,
        "CLONING",
        "Repository cloned successfully",
      );

      console.log(`Repository cloned to ${targetDir}`);

      const dockerfileExists = hasDockerfile(deployment.id);

      if (!dockerfileExists) {
        throw new Error("Dockerfile not found");
      }

      await prisma.deployment.update({
        where: {
          id: deploymentId,
        },
        data: {
          status: "BUILDING",
        },
      });

      await addDeploymentLog(deploymentId, "BUILDING", "Building Docker image");

      imageTag = await buildImage(deployment.id);

      await addDeploymentLog(
        deploymentId,
        "BUILDING",
        `Docker image built successfully (${imageTag})`,
      );

      console.log(`Built image ${imageTag}`);

      await prisma.deployment.update({
        where: {
          id: deployment.id,
        },
        data: {
          status: "DEPLOYING",
          imageTag,
        },
      });

      const containerPort = await getExposedPort(imageTag);
      const hostPort = await getAvailablePort();

      await addDeploymentLog(
        deploymentId,
        "DEPLOYING",
        `Starting container on host port ${hostPort}`,
      );

      containerId = await runContainer(imageTag, hostPort, containerPort);

      console.log(`Started container ${containerId}`);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const running = await isContainerRunning(containerId);

      if (!running) {
        console.log("Container exited immediately after startup");
        throw new Error("Container exited immediately after startup");
      }

      await addDeploymentLog(
        deploymentId,
        "DEPLOYING",
        `Container started (${containerId})`,
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

      subdomain = deployment.id.slice(0, 8);

      await prisma.deployment.update({
        where: {
          id: deployment.id,
        },
        data: {
          status: "SUCCESS",
          imageTag,
          containerId,
          hostPort,
          subdomain,
          deployedUrl: `http://${subdomain}.localhost`,
        },
      });

      await createNginxConfig(subdomain, hostPort);

      await addDeploymentLog(
        deploymentId,
        "NGINX",
        `Created nginx route ${subdomain}.localhost`,
      );

      await reloadNginx();

      await addDeploymentLog(deploymentId, "NGINX", "Reloaded nginx");

      await addDeploymentLog(
        deploymentId,
        "SUCCESS",
        `Deployment available at http://${subdomain}.localhost`,
      );

      await prisma.deployment.update({
        where: {
          id: deployment.id,
        },
        data: {
          status: "SUCCESS",
          imageTag,
          containerId,
          hostPort,
          deployedUrl: `http://${subdomain}.localhost`,
        },
      });

      console.log(`Application available at http://localhost:${hostPort}`);
    } catch (error) {
      console.error(`Failed processing ${deploymentId}`, error);

      if (imageTag || containerId) {
        if (containerId) {
          await stopAndRemoveContainer(containerId);
        }
        if (imageTag) {
          await removeImage(imageTag);
        }
        await addDeploymentLog(
          deploymentId,
          "CLEANUP",
          "Removed failed deployment resources",
        );
      }

      if (subdomain) {
        await deleteNginxConfig(subdomain);
        await addDeploymentLog(
          deploymentId,
          "NGINX",
          "Removed nginx configuration",
        );

        await reloadNginx();
        await addDeploymentLog(deploymentId, "NGINX", "Reloaded nginx");
      }

      await addDeploymentLog(
        deploymentId,
        "ERROR",
        error instanceof Error ? error.message : "Unknown error",
      );

      await prisma.deployment.update({
        where: {
          id: deploymentId,
        },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        },
      });
    } finally {
      try {
        await cleanupWorkspace(deploymentId);

        await addDeploymentLog(deploymentId, "CLEANUP", "Removed workspace");
      } catch (error) {
        console.error("Failed to cleanup workspace", error);
      }
    }
  }
}

startWorker().catch(console.error);
