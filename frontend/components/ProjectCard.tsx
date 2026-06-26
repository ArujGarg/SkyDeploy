"use client";

import { Project } from "@/lib/types";
import {
  ChevronDown,
  Clock,
  ExternalLink,
  GitBranch,
  Loader2,
  Play,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deployProject } from "@/lib/apis";
import { useState } from "react";
import StatusBadge from "./StatusBadge";
import { GithubIcon } from "./icons/Github";
import DeploymentHistory from "./DeploymentHistory";

type Props = {
  project: Project;
};

export default function ProjectCard({ project }: Props) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const latestDeployment = project.deployments[0];

  const deployMutation = useMutation({
    mutationFn: () => deployProject(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["deployments", project.id] });
      setExpanded(true);
    },
  });

  return (
    <div className="group relative rounded-xl border border-zinc-200 bg-white shadow-sm transition-all duration-200 hover:border-zinc-300 hover:shadow-md">
      <div className="p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          {/* Main Details */}
          <div className="space-y-4 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-semibold tracking-tight text-zinc-900">
                {project.name}
              </h3>

              {latestDeployment?.deployedUrl && (
                <a
                  href={latestDeployment.deployedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 transition hover:text-zinc-900"
                >
                  <span className="font-mono max-w-[200px] truncate">
                    {latestDeployment.deployedUrl.replace(/^https?:\/\//, "")}
                  </span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Git Metadata Row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
              <div className="flex items-center gap-1.5 font-mono">
                <GithubIcon className="h-3.5 w-3.5 text-zinc-400" />
                <span className="truncate max-w-[240px] hover:underline cursor-pointer">
                  {project.githubRepoUrl.split("/").slice(-2).join("/")}
                </span>
              </div>

              <div className="flex items-center gap-1 font-mono text-zinc-400">
                <GitBranch className="h-3.5 w-3.5" />
                <span>{project.branch}</span>
              </div>
            </div>
          </div>

          {/* Core Dashboard Actions */}
          <div className="flex items-center gap-2 sm:self-start">
            <button
              disabled={deployMutation.isPending}
              onClick={() => deployMutation.mutate()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {deployMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Deploying</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Deploy</span>
                </>
              )}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="cursor-pointer inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-900 active:bg-zinc-100"
            >
              <span>History</span>
              <ChevronDown
                className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Embedded Status Strip */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-100 pt-4">
          {latestDeployment ? (
            <div className="flex items-center gap-3">
              <StatusBadge status={latestDeployment.status} />
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {new Date(latestDeployment.createdAt).toLocaleDateString(
                    undefined,
                    {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-xs text-zinc-400">
              No production deployments found.
            </span>
          )}

          <span className="hidden text-xs text-zinc-400 font-mono sm:inline-block">
            ID: <span className="text-zinc-600">{project.id.slice(0, 7)}</span>
          </span>
        </div>
      </div>

      {/* Expandable Deployment History drawer */}
      {expanded && (
        <div className="border-t border-zinc-200 bg-zinc-50/50 p-6">
          <div className="mb-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Recent Deployments
            </h4>
          </div>
          <DeploymentHistory projectId={project.id} />
        </div>
      )}
    </div>
  );
}
