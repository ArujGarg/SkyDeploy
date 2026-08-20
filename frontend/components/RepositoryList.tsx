"use client";

import { Loader2, Rocket, Search } from "lucide-react";
import { GithubIcon } from "./icons/Github";
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
};

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
}: RepositoryListProps) {
  const query = search.trim().toLowerCase();
  const filteredRepos = repos.filter((repo) => {
    if (!query) return true;
    return (
      repo.name.toLowerCase().includes(query) ||
      repo.fullName.toLowerCase().includes(query) ||
      (repo.description ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-200/60">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Your Repositories</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Select a GitHub repository to deploy with SkyDeploy.
          </p>
        </div>
      </div>

      <div className="relative mt-6">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search repositories..."
          className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 outline-none transition focus:border-blue-500 focus:bg-white"
        />
      </div>

      {loading && (
        <div className="mt-8 flex items-center justify-center gap-2 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading repositories...
        </div>
      )}

      {!loading && error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-medium text-red-700">Could not load repositories</p>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && filteredRepos.length === 0 && (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center text-zinc-500">
          {repos.length === 0
            ? "No repositories were found on this GitHub account."
            : "No repositories match your search."}
        </div>
      )}

      {!loading && !error && filteredRepos.length > 0 && (
        <div className="mt-6 space-y-4">
          {filteredRepos.map((repo) => {
            const isDeployingThis =
              deploying && activeRepoUrl === repo.cloneUrl;

            return (
              <div
                key={repo.id}
                className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <GithubIcon className="h-4 w-4 text-zinc-500" />
                    <p className="truncate font-medium text-zinc-900">
                      {repo.name}
                    </p>
                    {repo.private && (
                      <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-500">
                        Private
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-zinc-500">
                    {repo.htmlUrl.replace(/^https?:\/\//, "")}
                  </p>
                  {repo.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                      {repo.description}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onDeploy(repo)}
                  disabled={deploying}
                  className="flex min-w-[140px] items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 py-3 font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeployingThis ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4" />
                      Deploy
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
