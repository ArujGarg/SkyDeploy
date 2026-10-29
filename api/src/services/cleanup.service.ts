import fs from "node:fs/promises";
import path from "node:path";
import {
  imageTagFor,
  removeContainersByLabel,
  removeImage,
} from "./docker.service.js";
import {
  deleteNginxConfig,
  nginxConfigExists,
  reloadNginx,
  subdomainFor,
} from "./nginx.service.js";

const WORKSPACE_ROOT = path.join(process.cwd(), "workspace");

// Each attempt clones into its own folder, so a worker that lost its lease
// can never delete the folder a newer attempt is building from.
export function workspaceNameFor(deploymentId: string, attempt: number) {
  return `${deploymentId}-${attempt}`;
}

export async function cleanupWorkspace(workspaceName: string) {
  await fs.rm(path.join(WORKSPACE_ROOT, workspaceName), {
    recursive: true,
    force: true,
  });
}

/** Removes the workspace folders of every attempt of this deployment. */
export async function cleanupAllWorkspaces(deploymentId: string) {
  let entries: string[];

  try {
    entries = await fs.readdir(WORKSPACE_ROOT);
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry === deploymentId || entry.startsWith(`${deploymentId}-`),
      )
      .map((entry) => cleanupWorkspace(entry)),
  );
}

/**
 * Removes everything a deployment may have left behind: containers (found by
 * label), the image, the nginx route and the workspaces. Safe to run when
 * nothing exists, so it can be used both before a retry and after a failure.
 * Returns human-readable notes about what was actually removed.
 */
export async function cleanupDeploymentResources(deploymentId: string) {
  const removed: string[] = [];

  const containers = await removeContainersByLabel(deploymentId);

  if (containers > 0) {
    removed.push(`${containers} container(s)`);
  }

  await removeImage(imageTagFor(deploymentId));

  const subdomain = subdomainFor(deploymentId);

  if (await nginxConfigExists(subdomain)) {
    await deleteNginxConfig(subdomain);
    await reloadNginx();
    removed.push("nginx route");
  }

  await cleanupAllWorkspaces(deploymentId);

  return removed;
}
