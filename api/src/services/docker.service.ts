import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export async function buildImage(deploymentId: string) {
  const imageTag = `skydeploy:${deploymentId}`;

  const projectPath = path.join(process.cwd(), "workspace", deploymentId);

  await execAsync(`docker build -t ${imageTag} ${projectPath}`);

  return imageTag;
}

export async function runContainer(
  imageTag: string,
  hostPort: Number,
  containerPort: Number,
) {
  const { stdout } = await execAsync(
    `docker run -d -p ${hostPort}:${containerPort} ${imageTag}`,
  );

  return stdout.trim();
}

export async function isContainerRunning(containerId: string) {
  const { stdout } = await execAsync(
    `docker inspect -f '{{.State.Running}}' ${containerId}`,
  );

  return stdout.trim() === "true";
}

export async function getExposedPort(imageTag: string): Promise<number> {
  const { stdout } = await execAsync(`docker image inspect ${imageTag}`);

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
    await execAsync(`docker rm -f ${containerId}`);
  } catch (error) {
    console.error(`Failed to remove container ${containerId}`, error);
  }
}
