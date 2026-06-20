import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export async function cloneRepository(repoUrl: string, deploymentId: string) {
  const targetDir = path.join(process.cwd(), "workspace", deploymentId);

  const { stdout, stderr } = await execAsync(
    `git clone ${repoUrl} ${targetDir}`,
  );

  if (stderr) {
    console.warn(stderr);
  }

  console.log(stdout);

  return targetDir;
}
