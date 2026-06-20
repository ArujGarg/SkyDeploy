import "./config/env.js";

import { prisma } from "./db/prisma.js";
import { connectRedis, redis } from "./lib/redis.js";
import { hasDockerfile } from "./services/deployment.service.js";
import {
  buildImage,
  getExposedPort,
  isContainerRunning,
  runContainer,
} from "./services/docker.service.js";
import { cloneRepository } from "./services/git.service.js";
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

      const targetDir = await cloneRepository(
        deployment.githubRepoUrl,
        deployment.id,
      );

      console.log(`Repository cloned to ${targetDir}`);

      const dockerfileExists = hasDockerfile(deployment.id);

      if (!dockerfileExists) {
        await prisma.deployment.update({
          where: {
            id: deployment.id,
          },
          data: {
            status: "FAILED",
            errorMessage: "Dockerfile not found",
          },
        });
        console.log("Dockerfile not found");
        continue;
      }

      await prisma.deployment.update({
        where: {
          id: deploymentId,
        },
        data: {
          status: "BUILDING",
        },
      });

      const imageTag = await buildImage(deployment.id);

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

      const containerId = await runContainer(imageTag, hostPort, containerPort);
      console.log(`Started container ${containerId}`);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const running = await isContainerRunning(containerId);

      if (!running) {
        await prisma.deployment.update({
          where: {
            id: deployment.id,
          },
          data: {
            status: "FAILED",
            errorMessage: "Container exited immediately",
          },
        });
        console.log("container is not running");

        continue;
      }

      console.log("container is running");
      await prisma.deployment.update({
        where: {
          id: deployment.id,
        },
        data: {
          status: "SUCCESS",
          imageTag,
          containerId,
          hostPort,
          deployedUrl: `http://localhost:${hostPort}`,
        },
      });

      console.log(`Application available at http://localhost:${hostPort}`);
    } catch (error) {
      console.error(`Failed processing ${deploymentId}`, error);

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
    }
  }
}

startWorker().catch(console.error);
