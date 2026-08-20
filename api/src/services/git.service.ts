import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export function isAllowedGithubRepoUrl(repoUrl: string) {
  try {
    const url = new URL(repoUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === "github.com" || url.hostname === "www.github.com")
    );
  } catch {
    return false;
  }
}

export async function cloneRepository(
  repoUrl: string,
  deploymentId: string,
  options?: { accessToken?: string | null },
) {
  if (!isAllowedGithubRepoUrl(repoUrl)) {
    throw new Error("Invalid GitHub repository URL");
  }

  const targetDir = path.join(process.cwd(), "workspace", deploymentId);

  const args = ["clone"];

  if (options?.accessToken) {
    args.push(
      "-c",
      `http.extraHeader=Authorization: Basic ${Buffer.from(
        `x-access-token:${options.accessToken}`,
      ).toString("base64")}`,
    );
  }

  args.push(repoUrl, targetDir);

  const { stdout, stderr } = await execFileAsync("git", args, {
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });

  if (stderr) {
    console.warn(stderr);
  }

  if (stdout) {
    console.log(stdout);
  }

  return targetDir;
}
