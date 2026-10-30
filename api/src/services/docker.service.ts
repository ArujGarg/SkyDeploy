import { execFile, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import { workerConfig } from "../config/worker.config.js";

const execFileAsync = promisify(execFile);

export const DEPLOYMENT_LABEL = "skydeploy.deployment";

export function imageTagFor(deploymentId: string) {
  return `skydeploy:${deploymentId}`;
}

/** The build ran and exited with an error. The message is kept short on purpose. */
export class BuildFailedError extends Error {
  constructor(exitCode: number | null, reason: string | null) {
    super(
      `Docker build failed (exit code ${exitCode ?? "unknown"})${reason ? `: ${reason}` : ""}`,
    );
    this.name = "BuildFailedError";
  }
}

/**
 * Runs a command and hands every line of its output (stdout and stderr) to
 * `onLine` as soon as it appears, instead of waiting for the command to finish.
 * If it runs longer than `timeoutMs` it is stopped (politely first, forcefully
 * 10 seconds later). Resolves with how it ended; rejects only if the command
 * could not be started at all.
 */
export function runStreaming(
  command: string,
  args: string[],
  options: { timeoutMs: number; onLine: (line: string) => void },
) {
  return new Promise<{ exitCode: number | null; timedOut: boolean }>(
    (resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let timedOut = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;

      const timer = setTimeout(() => {
        timedOut = true;
        // SIGINT lets `docker build` cancel the build inside Docker; a hard
        // kill could leave it running there. Force it if it does not stop.
        child.kill("SIGINT");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      }, options.timeoutMs);

      // A chunk can end in the middle of a line, so keep the unfinished part.
      const lineReader = () => {
        let carry = "";

        return {
          write(chunk: Buffer) {
            const parts = (carry + chunk.toString("utf8")).split(/\r?\n/);
            carry = parts.pop() ?? "";

            for (const line of parts) {
              options.onLine(line);
            }
          },
          end() {
            if (carry) {
              options.onLine(carry);
              carry = "";
            }
          },
        };
      };

      const out = lineReader();
      const err = lineReader();

      child.stdout.on("data", (chunk: Buffer) => out.write(chunk));
      child.stderr.on("data", (chunk: Buffer) => err.write(chunk));

      child.on("error", (error) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        reject(error);
      });

      child.on("close", (exitCode) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        out.end();
        err.end();
        resolve({ exitCode, timedOut });
      });
    },
  );
}

/**
 * Builds the image. Every line of Docker's output goes to `onLine` while the
 * build runs. On failure the error stays short: the details are in the lines
 * that were already passed on.
 */
export async function buildImage(
  deploymentId: string,
  workspaceName: string,
  onLine: (line: string) => void = () => {},
) {
  const imageTag = imageTagFor(deploymentId);

  const projectPath = path.join(process.cwd(), "workspace", workspaceName);

  // Docker prints its own summary of what went wrong on a line starting with
  // "ERROR:" (for example `ERROR: process "/bin/sh -c ..." did not complete`).
  let dockerError: string | null = null;

  const { exitCode, timedOut } = await runStreaming(
    "docker",
    ["build", "--progress=plain", "-t", imageTag, projectPath],
    {
      timeoutMs: workerConfig.buildTimeoutMs,
      onLine(line) {
        if (/^(#\d+ )?ERROR:/.test(line)) {
          dockerError = line.replace(/^#\d+ /, "").slice(0, 300);
        }

        onLine(line);
      },
    },
  );

  if (timedOut) {
    throw new Error(
      `Docker build timed out after ${workerConfig.buildTimeoutMs / 1000} seconds`,
    );
  }

  if (exitCode !== 0) {
    throw new BuildFailedError(exitCode, dockerError);
  }

  return imageTag;
}

export async function runContainer(
  deploymentId: string,
  attempt: number,
  imageTag: string,
  containerPort: number,
) {
  // The labels let a later attempt (or the reaper) find containers that a
  // dead attempt started, even though their ids were never saved.
  //
  // `127.0.0.1::<port>` lets Docker pick a free host port itself, in the same
  // step that starts the container. Picking one ourselves and starting the
  // container later let two workers choose the same port. Binding to
  // 127.0.0.1 keeps the app reachable only through nginx on this machine.
  const { stdout } = await execFileAsync("docker", [
    "run",
    "-d",
    "--label",
    `${DEPLOYMENT_LABEL}=${deploymentId}`,
    "--label",
    `skydeploy.attempt=${attempt}`,
    "-p",
    `127.0.0.1::${containerPort}`,
    imageTag,
  ]);

  return stdout.trim();
}

/** The host port Docker assigned to the container's port. */
export async function getPublishedPort(
  containerId: string,
  containerPort: number,
) {
  const { stdout } = await execFileAsync("docker", [
    "port",
    containerId,
    `${containerPort}/tcp`,
  ]);

  // Output looks like "127.0.0.1:32768", one line per bound address.
  const match = stdout.match(/:(\d+)\s*$/m);

  if (!match?.[1]) {
    throw new Error(
      `Could not find the published port of container ${containerId}`,
    );
  }

  return Number(match[1]);
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
