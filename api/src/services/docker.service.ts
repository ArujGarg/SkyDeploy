import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { workerConfig } from "../config/worker.config.js";

const execFileAsync = promisify(execFile);

// `docker build` prints a lot; the default 1MB buffer would fail big builds.
const BUILD_MAX_BUFFER = 50 * 1024 * 1024;

export const DEPLOYMENT_LABEL = "skydeploy.deployment";

export function imageTagFor(deploymentId: string) {
  return `skydeploy:${deploymentId}`;
}

export async function buildImage(deploymentId: string, workspaceName: string) {
  const imageTag = imageTagFor(deploymentId);

  const projectPath = path.join(process.cwd(), "workspace", workspaceName);

  try {
    await execFileAsync("docker", ["build", "-t", imageTag, projectPath], {
      timeout: workerConfig.buildTimeoutMs,
      killSignal: "SIGKILL",
      maxBuffer: BUILD_MAX_BUFFER,
    });
  } catch (error) {
    if (error instanceof Error && "killed" in error && error.killed) {
      throw new Error(
        `Docker build timed out after ${workerConfig.buildTimeoutMs / 1000} seconds`,
      );
    }

    throw error;
  }

  return imageTag;
}

export async function runContainer(
  deploymentId: string,
  attempt: number,
  imageTag: string,
  hostPort: number,
  containerPort: number,
) {
  // The labels let a later attempt (or the reaper) find containers that a
  // dead attempt started, even though their ids were never saved.
  const { stdout } = await execFileAsync("docker", [
    "run",
    "-d",
    "--label",
    `${DEPLOYMENT_LABEL}=${deploymentId}`,
    "--label",
    `skydeploy.attempt=${attempt}`,
    "-p",
    `${hostPort}:${containerPort}`,
    imageTag,
  ]);

  return stdout.trim();
}

export async function isContainerRunning(containerId: string) {
  const { stdout } = await execFileAsync("docker", [
    "inspect",
    "-f",
    "{{.State.Running}}",
    containerId,
  ]);

  return stdout.trim() === "true";
}

export async function getExposedPort(imageTag: string): Promise<number> {
  const { stdout } = await execFileAsync("docker", [
    "image",
    "inspect",
    imageTag,
  ]);

  const imageInfo = JSON.parse(stdout);

  const exposedPorts = imageInfo?.[0]?.Config?.ExposedPorts;

  if (!exposedPorts) {
    throw new Error(
      "No exposed ports found. Add EXPOSE <port> to your Dockerfile.",
    );
  }

  const ports = Object.keys(exposedPorts);

  if (ports.length === 0) {
    throw new Error(
      "No exposed ports found. Add EXPOSE <port> to your Dockerfile.",
    );
  }

  if (ports.length > 1) {
    throw new Error("Multiple exposed ports are not supported.");
  }

  const portString = ports[0]; // "3000/tcp"

  const port = Number(portString?.split("/")[0]);

  if (Number.isNaN(port)) {
    throw new Error(`Invalid exposed port: ${portString}`);
  }

  return port;
}

export async function stopAndRemoveContainer(
  containerId: string,
): Promise<void> {
  try {
    await execFileAsync("docker", ["rm", "-f", containerId]);
  } catch (error) {
    console.error(`Failed to remove container ${containerId}`, error);
  }
}

/** Removes every container (any attempt) started for this deployment. */
export async function removeContainersByLabel(
  deploymentId: string,
): Promise<number> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "ps",
      "-aq",
      "--filter",
      `label=${DEPLOYMENT_LABEL}=${deploymentId}`,
    ]);

    const containerIds = stdout.split("\n").filter(Boolean);

    if (containerIds.length > 0) {
      await execFileAsync("docker", ["rm", "-f", ...containerIds]);
    }

    return containerIds.length;
  } catch (error) {
    console.error(
      `Failed to remove containers for deployment ${deploymentId}`,
      error,
    );

    return 0;
  }
}

export async function removeImage(imageTag: string) {
  try {
    await execFileAsync("docker", ["image", "rm", imageTag]);
  } catch (error) {
    // Nothing to remove is the normal case when cleaning up "just in case".
    if (error instanceof Error && error.message.includes("No such image")) {
      return;
    }

    console.error(`Failed to remove image ${imageTag}`, error);
  }
}
