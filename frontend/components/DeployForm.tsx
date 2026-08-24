"use client";

import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { LogOut, Rocket } from "lucide-react";
import type { Session } from "next-auth";
import { GithubIcon } from "./icons/Github";
import { RepositoryList } from "./RepositoryList";
import type { Deployment, DeploymentLog } from "./DeploymentPanel";
import type { GithubRepo } from "@/lib/github";

export default function DeployForm({
  session,
  initialRepos,
  initialReposError,
}: {
  session: Session | null;
  initialRepos: GithubRepo[];
  initialReposError: string | null;
}) {
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);

  const [loading, setLoading] = useState(false);

  // Only used while the POST request is being created.
  const [activeRepoUrl, setActiveRepoUrl] = useState<string | null>(null);

  // Remembers which repo owns the current deployment.
  const [deploymentRepoUrl, setDeploymentRepoUrl] = useState<string | null>(
    null,
  );

  const [repos, setRepos] = useState<GithubRepo[]>(initialRepos);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(
    initialReposError,
  );

  const [deployError, setDeployError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

      // Clear the previous deployment UI.
      setDeployment(null);
      setLogs([]);
      setDeploymentId(null);

      // Remember which repository owns this deployment.
      setActiveRepoUrl(githubRepoUrl);
      setDeploymentRepoUrl(githubRepoUrl);

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

      // Don't show a deployment panel when deployment creation itself failed.
      setDeploymentRepoUrl(null);

      setDeployError(
        error instanceof Error ? error.message : "Failed to create deployment",
      );
    } finally {
      setLoading(false);
      setActiveRepoUrl(null);
    }
  }

  async function deployRepo(repo: GithubRepo) {
    await createDeployment(repo.cloneUrl, repo.defaultBranch);
  }

  useEffect(() => {
    if (!deploymentId) return;

    let stopped = false;

    const fetchDeploymentData = async () => {
      try {
        const [deploymentRes, logsRes] = await Promise.all([
          fetch(`/api/deployments/${deploymentId}`),
          fetch(`/api/deployments/${deploymentId}/logs`),
        ]);

        const deploymentData = await deploymentRes.json();
        const logsData = await logsRes.json();

        if (stopped) return;

        setDeployment(deploymentData);
        setLogs(logsData);

        if (
          deploymentData.status === "SUCCESS" ||
          deploymentData.status === "FAILED"
        ) {
          return true;
        }

        return false;
      } catch (error) {
        console.error(error);
        return false;
      }
    };

    const poll = async () => {
      const isFinished = await fetchDeploymentData();

      if (isFinished || stopped) return;

      timeoutId = setTimeout(poll, 2000);
    };

    let timeoutId: ReturnType<typeof setTimeout>;

    // Fetch immediately.
    void poll();

    return () => {
      stopped = true;
      clearTimeout(timeoutId);
    };
  }, [deploymentId]);

  const isDeploymentActive =
    deployment !== null &&
    deployment.status !== "SUCCESS" &&
    deployment.status !== "FAILED";

  return (
    <div className="mx-auto max-w-5xl">
      {/* User profile */}
      <div className="mb-10 flex items-center justify-end">
        {session?.user ? (
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name ?? "GitHub user"}
                className="h-9 w-9 rounded-xl border border-zinc-100"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100">
                <GithubIcon className="h-4 w-4" />
              </div>
            )}

            <div className="hidden min-w-0 text-left sm:block">
              <p className="max-w-[180px] truncate text-sm font-medium leading-tight text-zinc-900">
                {session.user.name}
              </p>

              {session.user.email && (
                <p className="max-w-[180px] truncate text-xs text-zinc-500">
                  {session.user.email}
                </p>
              )}
            </div>

            <div className="h-6 w-px bg-zinc-200" />

            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        ) : null}
      </div>

      {/* Hero */}
      <div className="mb-14 text-center sm:mb-16">
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg shadow-zinc-200/50">
            <Rocket className="h-8 w-8 text-zinc-900" />
          </div>
        </div>

        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 sm:text-6xl lg:text-7xl">
          SkyDeploy
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-500 sm:text-xl">
          Deploy Dockerized GitHub repositories with a single click. Watch
          builds, logs, and deployments happen live.
        </p>
      </div>

      {!session?.user ? (
        <div className="mx-auto max-w-xl rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl shadow-zinc-200/60 sm:p-10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
            <GithubIcon className="h-6 w-6 text-zinc-700" />
          </div>

          <h2 className="mt-5 text-lg font-semibold text-zinc-900">
            Connect your GitHub account
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Sign in to view your repositories and deploy projects that contain a
            Dockerfile.
          </p>

          <button
            type="button"
            onClick={() => signIn("github")}
            className="mt-7 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98]"
          >
            <GithubIcon className="h-5 w-5" />
            Continue with GitHub
          </button>
        </div>
      ) : (
        <>
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
            deployment={deployment}
            logs={logs}
            deploymentRepoUrl={deploymentRepoUrl}
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
    </div>
  );
}
