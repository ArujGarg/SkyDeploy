import fs from "node:fs/promises";

export async function cleanupWorkspace(deploymentId: string) {
  await fs.rm(`workspace/${deploymentId}`, {
    recursive: true,
    force: true,
  });
}
