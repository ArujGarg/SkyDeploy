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

export async function runContainer(imageTag: string) {
  const { stdout } = await execAsync(`docker run -d ${imageTag}`);

  return stdout.trim();
}

export async function isContainerRunning(containerId: string) {
  const { stdout } = await execAsync(
    `docker inspect -f '{{.State.Running}}' ${containerId}`,
  );

  return stdout.trim() === "true";
}
