"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Rocket,
  Search,
} from "lucide-react";
import { GithubIcon } from "./icons/Github";
import { DeploymentPanel } from "./DeploymentPanel";
import type { Deployment, DeploymentLog } from "./DeploymentPanel";
import type { GithubRepo } from "@/lib/github";

type RepositoryListProps = {
  repos: GithubRepo[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onRetry: () => void;
  onDeploy: (repo: GithubRepo) => void;

  deploying: boolean;
  activeRepoUrl: string | null;

  deployment: Deployment | null;
  logs: DeploymentLog[];

  deploymentRepoUrl: string | null;
};

function formatDuration(createdAt: string, now: number) {
  const start = new Date(createdAt).getTime();
  const totalSeconds = Math.max(0, Math.floor((now - start) / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

export function RepositoryList({
  repos,
  loading,
  error,
  search,
  onSearchChange,
  onRetry,
  onDeploy,
  deploying,
  activeRepoUrl,
  deployment,
  logs,
  deploymentRepoUrl,
}: RepositoryListProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const isActive =
      deployment &&
      deployment.status !== "SUCCESS" &&
      deployment.status !== "FAILED";

    if (!isActive) {
      return;
    }

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [deployment?.status]);

  const query = search.trim().toLowerCase();

  const filteredRepos = repos.filter((repo) => {
    if (!query) return true;

    return (
      repo.name.toLowerCase().includes(query) ||
      repo.fullName.toLowerCase().includes(query) ||
      (repo.description ?? "").toLowerCase().includes(query)
    );
  });

  const supportedRepoCount = repos.filter((repo) => repo.hasDockerfile).length;

  return (
    <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-200/60">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">
            Your Repositories
          </h2>

          <p className="mt-1 text-sm text-zinc-500">
            Deploy repositories that contain a Dockerfile. Unsupported
            repositories are shown below as well.
          </p>
        </div>

        {!loading && !error && repos.length > 0 && (
          <span className="w-fit shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
            {supportedRepoCount} of {repos.length} deployable
          </span>
        )}
      </div>

      <div className="relative mt-6">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />

        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search repositories..."
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-100"
        />
      </div>

      {loading && (
        <div className="mt-8 flex items-center justify-center gap-2 py-6 text-sm text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading repositories...
        </div>
      )}

      {!loading && error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-medium text-red-700">
            Could not load repositories
          </p>

          <p className="mt-2 text-sm leading-6 text-red-600">{error}</p>

          <button
            type="button"
            onClick={onRetry}
            className="mt-4 cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:scale-[0.98]"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && filteredRepos.length === 0 && (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
          {repos.length === 0
            ? "No repositories were found on this GitHub account."
            : "No repositories match your search."}
        </div>
      )}

      {!loading && !error && filteredRepos.length > 0 && (
        <div className="mt-6 space-y-3">
          {filteredRepos.map((repo) => {
            const isDeployingThis =
              deploying && activeRepoUrl === repo.cloneUrl;

            const isSupported = repo.hasDockerfile;

            const showDeploymentPanel = deploymentRepoUrl === repo.cloneUrl;

            return (
              <div
                key={repo.id}
                className={`overflow-hidden rounded-2xl border transition ${
                  isSupported
                    ? "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white"
                    : "border-zinc-200 bg-zinc-50/70"
                }`}
              >
                <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <GithubIcon className="h-4 w-4 shrink-0 text-zinc-500" />

                      <p className="truncate font-medium text-zinc-900">
                        {repo.name}
                      </p>

                      {repo.private && (
                        <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-500">
                          Private
                        </span>
                      )}

                      {isSupported ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Dockerfile detected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <CircleAlert className="h-3 w-3" />
                          Unsupported
                        </span>
                      )}
                    </div>

                    <p className="mt-1.5 truncate text-sm text-zinc-500">
                      {repo.htmlUrl.replace(/^https?:\/\//, "")}
                    </p>

                    {repo.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
                        {repo.description}
                      </p>
                    )}

                    {!isSupported && (
                      <p className="mt-3 text-xs leading-5 text-zinc-500">
                        Add a Dockerfile to deploy this repository with
                        SkyDeploy.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeploy(repo)}
                    disabled={deploying || !isSupported}
                    className={`flex min-w-[140px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition ${
                      isSupported
                        ? "cursor-pointer bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]"
                        : "cursor-not-allowed border border-zinc-200 bg-white text-zinc-400"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {isDeployingThis ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {deployment && deploymentRepoUrl === repo.cloneUrl
                          ? `Deploying • ${formatDuration(deployment.createdAt, now)}`
                          : "Deploying..."}
                      </>
                    ) : !isSupported ? (
                      <>
                        <CircleAlert className="h-4 w-4" />
                        Unsupported
                      </>
                    ) : (
                      <>
                        <Rocket className="h-4 w-4" />
                        Deploy
                      </>
                    )}
                  </button>
                </div>

                {showDeploymentPanel && deployment && (
                  <DeploymentPanel deployment={deployment} logs={logs} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
