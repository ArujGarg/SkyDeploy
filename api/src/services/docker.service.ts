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
