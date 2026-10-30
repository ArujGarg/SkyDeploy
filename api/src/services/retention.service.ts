import { prisma } from "../db/prisma.js";
import { ACTIVE_STATUSES } from "../config/worker.config.js";
import { cleanupDeploymentResources } from "./cleanup.service.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stopAndRemoveContainer } from "./docker.service.js";
import { addDeploymentLog } from "./log.service.js";

const execFileAsync = promisify(execFile);

// A project keeps exactly one running deployment: the newest one that
// succeeded. Older ones are stopped and their container, image and nginx route
// removed, so redeploying does not pile up copies of the app (memory) and
// images (disk).

type RetentionDeps = {
  /** Removes containers (by label), image, nginx route and workspaces. */
  cleanup: (deploymentId: string) => Promise<string[]>;
  /** Removes a container by the id stored on the deployment. */
  removeContainer: (containerId: string) => Promise<void>;
  log: (deploymentId: string, stage: string, message: string) => Promise<unknown>;
};

const defaultDeps: RetentionDeps = {
  cleanup: cleanupDeploymentResources,
  removeContainer: stopAndRemoveContainer,
  log: addDeploymentLog,
};

/**
 * Stops every live deployment of the project except the newest one (by when it
 * was created). Safe to call at any time and from several workers at once: the
 * answer does not depend on which one finishes first, and each deployment is
 * claimed with a conditional update so it is cleaned up exactly once.
 * Never throws: a failure is logged and the deployment is left to be retried.
 * Returns the ids it stopped.
 */
export async function stopSupersededDeployments(
  projectId: string,
  deps: RetentionDeps = defaultDeps,
): Promise<string[]> {
  const live = await prisma.deployment.findMany({
    where: { projectId, status: "SUCCESS", stoppedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, containerId: true },
  });

  const [newest, ...older] = live;
  const stopped: string[] = [];

  if (!newest) {
    return stopped;
  }

  for (const old of older) {
    // Claim it first, so two workers never both clean the same deployment.
    const { count } = await prisma.deployment.updateMany({
      where: { id: old.id, status: "SUCCESS", stoppedAt: null },
      data: { stoppedAt: new Date() },
    });

    if (count !== 1) {
      continue;
    }

    try {
      await deps.cleanup(old.id);

      // Deployments made before containers were labelled are only known by the
      // id saved on the row.
      if (old.containerId) {
        await deps.removeContainer(old.containerId);
      }

      stopped.push(old.id);

      await deps.log(
        old.id,
        "CLEANUP",
        `Stopped: replaced by a newer deployment (${newest.id.slice(0, 8)})`,
      );
    } catch (error) {
      console.error(`Failed to stop superseded deployment ${old.id}`, error);

      // Not stopped after all: allow a later run to try again.
      await prisma.deployment
        .updateMany({
          where: { id: old.id, stoppedAt: { not: null } },
          data: { stoppedAt: null },
        })
        .catch(() => {});
    }
  }

  return stopped;
}

/** Projects that currently have more than one live deployment. */
export async function findProjectsWithSupersededDeployments() {
  const groups = await prisma.deployment.groupBy({
    by: ["projectId"],
    where: { status: "SUCCESS", stoppedAt: null },
    having: { id: { _count: { gt: 1 } } },
  });

  return groups.map((group) => group.projectId);
}

/**
 * Of the `skydeploy:<id>` images on this machine, the ones nothing needs any
 * more: the deployment is not live and not being built. Pure, so it can be
 * tested without Docker.
 */
export function selectUnusedImages(
  imageTags: string[],
  neededDeploymentIds: Set<string>,
) {
  return imageTags.filter((tag) => {
    if (!tag.startsWith("skydeploy:")) {
      return false;
    }

    return !neededDeploymentIds.has(tag.slice("skydeploy:".length));
  });
}

async function docker(...args: string[]) {
  return execFileAsync("docker", args, { maxBuffer: 10 * 1024 * 1024 });
}

// Docker's build cache has no limit of its own and grows with every build.
const BUILD_CACHE_LIMIT = "3gb";

/**
 * Hourly housekeeping: finish stopping superseded deployments that failed
 * earlier, delete images of deployments that are neither live nor being
 * built, and trim Docker's caches. Each step is independent and never throws.
 */
export async function runHousekeeping() {
  const report = { retried: 0, imagesRemoved: 0 };

  try {
    for (const projectId of await findProjectsWithSupersededDeployments()) {
      report.retried += (await stopSupersededDeployments(projectId)).length;
    }
  } catch (error) {
    console.error("Housekeeping: retrying superseded deployments failed", error);
  }

  try {
    const needed = await prisma.deployment.findMany({
      where: {
        OR: [
          { status: "SUCCESS", stoppedAt: null },
          { status: { in: ACTIVE_STATUSES } },
        ],
      },
      select: { id: true },
    });

    const { stdout } = await docker(
      "images",
      "--format",
      "{{.Repository}}:{{.Tag}}",
    );

    const unused = selectUnusedImages(
      stdout.split("\n").filter(Boolean),
      new Set(needed.map((deployment) => deployment.id)),
    );

    for (const tag of unused) {
      try {
        // Fails (and is ignored) if a container still uses the image.
        await docker("image", "rm", tag);
        report.imagesRemoved += 1;
      } catch {
        // In use or already gone.
      }
    }

    await docker("image", "prune", "-f");
    await docker("builder", "prune", "-f", "--max-used-space", BUILD_CACHE_LIMIT);
  } catch (error) {
    console.error("Housekeeping: docker cleanup failed", error);
  }

  return report;
}

