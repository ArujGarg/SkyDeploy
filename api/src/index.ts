import "./config/env.js";

import express from "express";
import { prisma } from "./db/prisma.js";
import { connectRedis } from "./lib/redis.js";
import { enqueueDeployment } from "./services/queue.service.js";

const app = express();

app.use(express.json());

app.get("/api/deployments/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deployment = await prisma.deployment.findUnique({
      where: {
        id,
      },
    });

    if (!deployment) {
      return res.status(404).json({
        message: "Deployment not found",
      });
    }

    return res.json(deployment);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch deployment",
    });
  }
});

app.post("/api/deployments", async (req, res) => {
  try {
    const { githubRepoUrl, branch } = req.body;

    const deployment = await prisma.deployment.create({
      data: {
        githubRepoUrl,
        branch: branch || "main",
        status: "QUEUED",
      },
    });

    await enqueueDeployment(deployment.id);

    res.status(201).json(deployment);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to create deployment",
    });
  }
});

app.get("api/deployments/:id/logs", async (req, res) => {
  const deploymentId = req.params.id;
  const logs = await prisma.deploymentLog.findMany({
    where: {
      deploymentId,
    },
    select: {
      stage: true,
      message: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  res.status(200).json(logs);
});

await connectRedis();

app.listen(3001, () => {
  console.log("Server is running on port 3000");
});
