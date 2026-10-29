import fs from "fs";
import path from "path";

export function hasDockerfile(workspaceName: string) {
  const dockerfilePath = path.join(
    process.cwd(),
    "workspace",
    workspaceName,
    "Dockerfile",
  );

  return fs.existsSync(dockerfilePath);
}
