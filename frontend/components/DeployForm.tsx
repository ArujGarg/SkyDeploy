"use client";

import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Loader2, Rocket, ExternalLink } from "lucide-react";
import type { Session } from "next-auth";
import { GithubIcon } from "./icons/Github";
import { RepositoryList } from "./RepositoryList";
import type { GithubRepo } from "@/lib/github";

type Deployment = {
  id: string;
  status:
    | "QUEUED"
    | "CLONING"
    | "BUILDING"
    | "DEPLOYING"
    | "SUCCESS"
    | "FAILED";
  deployedUrl: string | null;
  errorMessage: string | null;
};

type DeploymentLog = {
  stage: string;
  message: string;
  createdAt: string;
};

const statusColors = {
  QUEUED: "bg-zinc-100 text-zinc-700 border border-zinc-200",
  CLONING: "bg-blue-50 text-blue-700 border border-blue-200",
  BUILDING: "bg-amber-50 text-amber-700 border border-amber-200",
  DEPLOYING: "bg-purple-50 text-purple-700 border border-purple-200",
  SUCCESS: "bg-green-50 text-green-700 border border-green-200",
  FAILED: "bg-red-50 text-red-700 border border-red-200",
};

export default function DeployForm({
  session,
  initialRepos,
  initialReposError,
}: {
  session: Session | null;
  initialRepos: GithubRepo[];
  initialReposError: string | null;
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [repos, setRepos] = useState<GithubRepo[]>(initialRepos);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(
    initialReposError,
  );
  const [deployError, setDeployError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeRepoUrl, setActiveRepoUrl] = useState<string | null>(null);

  async function loadRepositories() {
    setReposLoading(true);
    setReposError(null);

    try {
      const response = await fetch("/api/github/repos");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load repositories");
      }

      setRepos(data.repos ?? []);
    } catch (error) {
      setRepos([]);
      setReposError(
        error instanceof Error
          ? error.message
          : "Failed to load GitHub repositories.",
      );
    } finally {
      setReposLoading(false);
    }
  }

  async function createDeployment(githubRepoUrl: string, branch?: string) {
    if (!githubRepoUrl.trim()) return;

    try {
      setLoading(true);
      setDeployError(null);
      setDeployment(null);
      setLogs([]);
      setDeploymentId(null);
      setActiveRepoUrl(githubRepoUrl);

      const response = await fetch("/api/deployments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          githubRepoUrl,
          branch,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create deployment");
      }

      setDeploymentId(data.id);
    } catch (error) {
      console.error(error);
      setDeployError(
        error instanceof Error ? error.message : "Failed to create deployment",
      );
    } finally {
      setLoading(false);
      setActiveRepoUrl(null);
    }
  }

  async function deployFromUrl() {
    await createDeployment(repoUrl);
  }

  async function deployRepo(repo: GithubRepo) {
    await createDeployment(repo.cloneUrl, repo.defaultBranch);
  }

  useEffect(() => {
    if (!deploymentId) return;

    const interval = setInterval(async () => {
      try {
        const deploymentRes = await fetch(`/api/deployments/${deploymentId}`);

        const deploymentData = await deploymentRes.json();

        setDeployment(deploymentData);

        const logsRes = await fetch(`/api/deployments/${deploymentId}/logs`);

        const logsData = await logsRes.json();

        setLogs(logsData);

        if (
          deploymentData.status === "SUCCESS" ||
          deploymentData.status === "FAILED"
        ) {
          clearInterval(interval);
        }
      } catch (error) {
        console.error(error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [deploymentId]);

  const isDeploymentActive =
    deployment &&
    deployment.status !== "SUCCESS" &&
    deployment.status !== "FAILED";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-end">
        {session?.user ? (
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name ?? "GitHub user"}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100">
                <GithubIcon className="h-4 w-4" />
              </div>
            )}
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-tight">
                {session.user.name}
              </p>
              {session.user.email && (
                <p className="text-xs text-zinc-500">{session.user.email}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-xl px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      <div className="mb-14 text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg">
            <Rocket className="h-8 w-8" />
          </div>
        </div>

        <h1 className="text-7xl font-bold tracking-tight text-zinc-900">
          SkyDeploy
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-xl text-zinc-500">
          Deploy Dockerized GitHub repositories with a single click. Watch
          builds, logs, and deployments happen live.
        </p>
      </div>

      {!session?.user ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl shadow-zinc-200/60">
          <p className="text-zinc-600">
            Sign in with GitHub to see your repositories and deploy them.
          </p>
          <button
            type="button"
            onClick={() => signIn("github")}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-6 py-4 font-medium text-white transition hover:bg-zinc-800"
          >
            <GithubIcon className="h-5 w-5" />
            Continue with GitHub
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-200/60">
            <p className="mb-4 text-sm font-medium text-zinc-500">
              Or paste a repository URL
            </p>
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="relative flex-1">
                <GithubIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />

                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/user/repository"
                  className="
                w-full
                rounded-2xl
                border
                border-zinc-200
                bg-zinc-50
                py-4
                pl-12
                pr-4
                outline-none
                transition
                focus:border-blue-500
                focus:bg-white
              "
                />
              </div>

              <button
                onClick={deployFromUrl}
                disabled={loading || !repoUrl || !!isDeploymentActive}
                className="
              flex
              min-w-[170px]
              items-center
              justify-center
              gap-2
              rounded-2xl
              bg-zinc-900
              px-6
              py-4
              font-medium
              text-white
              transition
              hover:bg-zinc-800
              disabled:cursor-not-allowed
              disabled:opacity-50
              cursor-pointer
            "
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : isDeploymentActive ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {deployment?.status}
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Deploy
                  </>
                )}
              </button>
            </div>
          </div>

          <RepositoryList
            repos={repos}
            loading={reposLoading}
            error={reposError}
            search={search}
            onSearchChange={setSearch}
            onRetry={() => void loadRepositories()}
            onDeploy={(repo) => void deployRepo(repo)}
            deploying={loading || !!isDeploymentActive}
            activeRepoUrl={activeRepoUrl}
          />

          {deployError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="font-medium text-red-700">
                Could not start deployment
              </p>
              <p className="mt-2 text-sm text-red-600">{deployError}</p>
            </div>
          )}
        </>
      )}

      {deployment && (
        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Deployment Status</h2>

              <p className="mt-1 text-sm text-zinc-500">
                Deployment ID: {deployment.id}
              </p>
            </div>

            <span
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                statusColors[deployment.status]
              }`}
            >
              {deployment.status}
            </span>
          </div>

          {deployment.status === "SUCCESS" && deployment.deployedUrl && (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5">
              <p className="mb-3 font-medium text-green-700">
                Deployment Successful
              </p>

              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <code className="rounded-lg bg-white px-3 py-2 text-sm">
                  {deployment.deployedUrl}
                </code>

                <a
                  href={deployment.deployedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="
                    flex
                    items-center
                    gap-2
                    rounded-xl
                    bg-green-600
                    px-4
                    py-2
                    font-medium
                    text-white
                    hover:bg-green-500
                  "
                >
                  Open Deployment
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}

          {deployment.status === "FAILED" && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="font-medium text-red-700">Deployment Failed</p>

              <p className="mt-2 text-red-600">{deployment.errorMessage}</p>
            </div>
          )}
        </div>
      )}

      {deploymentId && (
        <div className="mt-8 rounded-3xl bg-zinc-950 p-6 shadow-2xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Live Logs</h2>

            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              Live
            </div>
          </div>

          <div className="max-h-[500px] space-y-3 overflow-y-auto font-mono text-sm">
            {logs.length === 0 && (
              <div className="text-zinc-500">Waiting for logs...</div>
            )}

            {logs.map((log, index) => (
              <div
                key={`${log.createdAt}-${index}`}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-3"
              >
                <span className="mr-2 text-blue-400">[{log.stage}]</span>

                <span className="text-zinc-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
