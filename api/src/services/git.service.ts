import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { workerConfig } from "../config/worker.config.js";

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
  workspaceName: string,
  options?: { accessToken?: string | null },
) {
  if (!isAllowedGithubRepoUrl(repoUrl)) {
    throw new Error("Invalid GitHub repository URL");
  }

  const targetDir = path.join(process.cwd(), "workspace", workspaceName);

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

  let output: { stdout: string; stderr: string };

  try {
    output = await execFileAsync("git", args, {
      timeout: workerConfig.cloneTimeoutMs,
      killSignal: "SIGKILL",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    });
  } catch (error) {
    // The raw error message contains the full command line, which includes
    // the access token header. Never let that reach logs or the UI.
    if (error instanceof Error && "killed" in error && error.killed) {
      throw new Error(
        `Cloning timed out after ${workerConfig.cloneTimeoutMs / 1000} seconds`,
      );
    }

    const stderr =
      error instanceof Error && "stderr" in error
        ? String(error.stderr).replaceAll(options?.accessToken ?? "\0", "***")
        : "";

    throw new Error(
      `Failed to clone repository${stderr ? `: ${stderr.trim().split("\n")[0]}` : ""}`,
    );
  }

  const { stdout, stderr } = output;

  if (stderr) {
    console.warn(stderr);
  }

  if (stdout) {
    console.log(stdout);
  }

  return targetDir;
}
