import "./config/env.js";

import { prisma } from "./db/prisma.js";
import { connectRedis, redis } from "./lib/redis.js";
import { hasDockerfile } from "./services/deployment.service.js";
import { cloneRepository } from "./services/git.service.js";

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

      console.log(`Deployment ${deployment.id} ready for build`);
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
