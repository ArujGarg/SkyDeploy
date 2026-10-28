import "./config/env.js";

import express from "express";
import { prisma } from "./db/prisma.js";
import { connectRedis } from "./lib/redis.js";
import { isAllowedGithubRepoUrl } from "./services/git.service.js";
import { enqueueDeployment } from "./services/queue.service.js";
import cors from "cors";
const app = express();

// Only the frontend origin(s) may call this API from a browser.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

function authenticateInternalRequest(req: express.Request) {
  const expectedSecret = process.env.INTERNAL_API_SECRET;
  const providedSecret = req.header("x-internal-api-secret");

  return Boolean(
    expectedSecret && providedSecret && providedSecret === expectedSecret,
  );
}

// Reads the user id the Next.js server says is making this request.
function getRequestUserId(req: express.Request) {
  const userId = req.query.userId;

  return typeof userId === "string" && userId ? userId : null;
}

app.get("/api/deployments/:id", async (req, res) => {
  try {
    if (!authenticateInternalRequest(req)) {
      return res.status(403).json({
        message: "Invalid internal API credentials",
      });
    }

    const userId = getRequestUserId(req);

    if (!userId) {
      return res.status(400).json({
        message: "Authenticated user ID is required",
      });
    }

    const { id } = req.params;

    // Scoped to the owner: a deployment someone else owns looks the same as
    // one that doesn't exist (404), so ids can't be probed.
    const deployment = await prisma.deployment.findFirst({
      where: {
        id,
        project: {
          userId,
        },
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
  let deploymentId: string | null = null;

  try {
    if (!authenticateInternalRequest(req)) {
      return res.status(403).json({
        message: "Invalid internal API credentials",
      });
    }

    const { githubRepoUrl, branch, userId } = req.body;

    if (typeof userId !== "string" || !userId) {
      return res.status(400).json({
        message: "Authenticated user ID is required",
      });
    }

    if (
      typeof githubRepoUrl !== "string" ||
      !isAllowedGithubRepoUrl(githubRepoUrl)
    ) {
      return res.status(400).json({
        message: "A valid GitHub HTTPS repository URL is required",
      });
    }

    const deploymentBranch =
      typeof branch === "string" && branch ? branch : "main";

    const repoName = githubRepoUrl
      .replace(/\.git$/, "")
      .split("/")
      .pop();

    const project = await prisma.project.upsert({
      where: {
        userId_githubRepoUrl: {
          userId,
          githubRepoUrl,
        },
      },
      update: {
        branch: deploymentBranch,
      },
      create: {
        name: repoName || "Untitled Project",
        githubRepoUrl,
        branch: deploymentBranch,
        userId,
      },
    });

    const deployment = await prisma.deployment.create({
      data: {
        githubRepoUrl,
        branch: deploymentBranch,
        status: "QUEUED",
        projectId: project.id,
      },
    });

    deploymentId = deployment.id;

    // IMPORTANT: only return success after the job was actually queued.
    await enqueueDeployment(deployment.id);

    return res.status(201).json(deployment);
  } catch (error) {
    console.error("Failed to create or enqueue deployment:", error);

    // If we created the deployment but failed to put it in Redis,
    // don't leave it stuck in QUEUED forever.
    if (deploymentId) {
      try {
        await prisma.deployment.update({
          where: {
            id: deploymentId,
          },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage:
              "Failed to queue deployment. The deployment service may be temporarily unavailable.",
          },
        });
      } catch (updateError) {
        console.error("Failed to mark deployment as FAILED:", updateError);
      }
    }

    return res.status(500).json({
      message: "Failed to start deployment. Please try again.",
    });
  }
});

app.get("/api/deployments/:id/logs", async (req, res) => {
  try {
    if (!authenticateInternalRequest(req)) {
      return res.status(403).json({
        message: "Invalid internal API credentials",
      });
    }

    const userId = getRequestUserId(req);

    if (!userId) {
      return res.status(400).json({
        message: "Authenticated user ID is required",
      });
    }

    const deploymentId = req.params.id;

    // Same ownership rule as GET /api/deployments/:id.
    const deployment = await prisma.deployment.findFirst({
      where: {
        id: deploymentId,
        project: {
          userId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!deployment) {
      return res.status(404).json({
        message: "Deployment not found",
      });
    }

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

    return res.status(200).json(logs);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch deployment logs",
    });
  }
});

app.get("/api/projects", async (req, res) => {
  try {
    if (!authenticateInternalRequest(req)) {
      return res.status(403).json({
        message: "Invalid internal API credentials",
      });
    }

    const userId = req.query.userId;

    if (typeof userId !== "string" || !userId) {
      return res.status(400).json({
        message: "Authenticated user ID is required",
      });
    }

    const projects = await prisma.project.findMany({
      where: {
        userId,
      },
      include: {
        deployments: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return res.json({ projects });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch projects",
    });
  }
});

await connectRedis();

app.listen(3001, () => {
  console.log("Server is running on port 3001");
});
