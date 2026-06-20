import fs from "fs";
import path from "path";

export function hasDockerfile(deploymentId: string) {
  const dockerfilePath = path.join(
    process.cwd(),
    "workspace",
    deploymentId,
    "Dockerfile",
  );

  return fs.existsSync(dockerfilePath);
}
