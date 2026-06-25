import "./config/env.js";

import express from "express";
import { prisma } from "./db/prisma.js";
import { connectRedis } from "./lib/redis.js";
import { enqueueDeployment } from "./services/queue.service.js";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/api/projects", async (req, res) => {
  try {
    const { name, githubRepoUrl, branch } = req.body;

    const project = await prisma.project.create({
      data: {
        name,
        githubRepoUrl,
        branch: branch || "main",
      },
    });

    return res.status(201).json(project);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create project",
    });
  }
});

app.get("/api/projects", async (req, res) => {
  try {
    //taking the latest deployment in projects to avoind N+1 query problem
    const projects = await prisma.project.findMany({
      include: {
        deployments: {
          take: 1,
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json(projects);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch projects",
    });
  }
});

app.get("/api/projects/:id", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    return res.status(200).json(project);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch project",
    });
  }
});

app.post("/api/projects/:id/deploy", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        status: "QUEUED",
      },
    });

    await enqueueDeployment(deployment.id);

    return res.status(201).json(deployment);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to deploy project",
    });
  }
});

app.get("/api/projects/:id/deployments", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const deployments = await prisma.deployment.findMany({
      where: {
        projectId: project.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json(deployments);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch deployments",
    });
  }
});

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

app.get("/api/deployments/:id/logs", async (req, res) => {
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
