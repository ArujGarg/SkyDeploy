"use client";

import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Rocket } from "lucide-react";
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

      // Remember which repo was clicked.
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

      // There is no valid deployment to show if creation failed.
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

    const fetchDeploymentData = async () => {
      try {
        const deploymentRes = await fetch(`/api/deployments/${deploymentId}`);

        const deploymentData = await deploymentRes.json();

        setDeployment(deploymentData);

        const logsRes = await fetch(`/api/deployments/${deploymentId}/logs`);

        const logsData = await logsRes.json();

        setLogs(logsData);
      } catch (error) {
        console.error(error);
      }
    };

    // Fetch immediately instead of waiting 2 seconds.
    void fetchDeploymentData();

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
    deployment !== null &&
    deployment.status !== "SUCCESS" &&
    deployment.status !== "FAILED";

  return (
    <div className="mx-auto max-w-5xl">
      {/* User profile */}
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

      {/* Hero */}
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
