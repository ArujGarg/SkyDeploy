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

/**
 * A conservative subset of what git allows in a branch name. Besides being
 * well-formed, the name must not start with "-" (git would read it as an
 * option) or contain ".." (path-like tricks).
 */
export function isValidBranchName(branch: string) {
  return (
    branch.length > 0 &&
    branch.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) &&
    !branch.includes("..") &&
    !branch.includes("//") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".") &&
    !branch.endsWith(".lock")
  );
}

/**
 * Turns git's stderr into one readable line. git prints progress such as
 * "Cloning into '<path>'..." before the real reason, so look for the
 * `fatal:`/`error:` line instead of taking the first one. The access token is
 * masked in case git echoes it.
 */
export function describeCloneFailure(stderr: string, accessToken?: string | null) {
  const cleaned = accessToken
    ? stderr.replaceAll(accessToken, "***")
    : stderr;

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const reason =
    lines.findLast((line) => /^(fatal|error):/i.test(line)) ?? lines.at(-1);

  return reason
    ? `Failed to clone repository: ${reason}`
    : "Failed to clone repository";
}

/** The arguments for `git clone`, kept separate so they can be tested. */
export function buildCloneArgs(
  repoUrl: string,
  targetDir: string,
  options?: { accessToken?: string | null; branch: string },
) {
  const args = ["clone"];

  if (options?.accessToken) {
    args.push(
      "-c",
      `http.extraHeader=Authorization: Basic ${Buffer.from(
        `x-access-token:${options.accessToken}`,
      ).toString("base64")}`,
    );
  }

  // Clone exactly the branch we recorded for this deployment. Without this,
  // git checks out the repository's default branch, which may differ from the
  // branch shown to the user. `--branch=<name>` (one argument) keeps the name
  // from ever being read as a separate option.
  if (options?.branch) {
    args.push(`--branch=${options.branch}`);
  }

  args.push(repoUrl, targetDir);

  return args;
}

export async function cloneRepository(
  repoUrl: string,
  workspaceName: string,
  options: { accessToken?: string | null; branch: string },
) {
  if (!isAllowedGithubRepoUrl(repoUrl)) {
    throw new Error("Invalid GitHub repository URL");
  }

  if (!isValidBranchName(options.branch)) {
    throw new Error("Invalid branch name");
  }

  const targetDir = path.join(process.cwd(), "workspace", workspaceName);

  const args = buildCloneArgs(repoUrl, targetDir, options);

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
      error instanceof Error && "stderr" in error ? String(error.stderr) : "";

    throw new Error(describeCloneFailure(stderr, options.accessToken));
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
