"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  ExternalLink,
  GitBranch,
  Loader2,
  Package,
  Rocket,
  ScrollText,
} from "lucide-react";
import type {
  DeploymentHistory,
  DeploymentStatus,
  Project,
} from "@/app/deployments/page";
import { GithubIcon } from "./icons/Github";

type DeploymentLog = {
  stage: string;
  message: string;
  createdAt: string;
};

type ProjectsListProps = {
  projects: Project[];
  onRedeploy: (project: Project) => void;
  redeployingProjectId: string | null;
  activeDeploymentId: string | null;
};

const statusStyles: Record<
  DeploymentStatus,
  {
    label: string;
    className: string;
  }
> = {
  QUEUED: {
    label: "Queued",
    className: "border-zinc-200 bg-zinc-100 text-zinc-700",
  },
  CLONING: {
    label: "Cloning",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  BUILDING: {
    label: "Building",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  DEPLOYING: {
    label: "Deploying",
    className: "border-purple-200 bg-purple-50 text-purple-700",
  },
  SUCCESS: {
    label: "Success",
    className: "border-green-200 bg-green-50 text-green-700",
  },
  FAILED: {
    label: "Failed",
    className: "border-red-200 bg-red-50 text-red-700",
  },
};

function formatDate(dateString: string) {
  const date = new Date(dateString);

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(deployment: DeploymentHistory, now: number) {
  const start = new Date(deployment.createdAt).getTime();

  const end = deployment.completedAt
    ? new Date(deployment.completedAt).getTime()
    : now;

  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));

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

function formatLogTime(dateString: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(dateString));
}

function StatusIcon({ status }: { status: DeploymentStatus }) {
  if (status === "SUCCESS") {
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  }

  if (status === "FAILED") {
    return <CircleAlert className="h-4 w-4 text-red-600" />;
  }

  return <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />;
}

function DeploymentRow({
  deployment,
  shouldAutoOpen,
}: {
  deployment: DeploymentHistory;
  shouldAutoOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [logsVisible, setLogsVisible] = useState(false);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  useEffect(() => {
    if (deployment.completedAt) {
      return;
    }

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [deployment.completedAt]);

  useEffect(() => {
    if (shouldAutoOpen) {
      setExpanded(true);
      setLogsVisible(true);
    }
  }, [shouldAutoOpen]);

  async function fetchLogs(showLoading = false) {
    try {
      if (showLoading) {
        setLogsLoading(true);
      }

      setLogsError(null);

      const response = await fetch(`/api/deployments/${deployment.id}/logs`, {
        cache: "no-store",
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const errorMessage =
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : "Failed to load deployment logs.";

        throw new Error(errorMessage);
      }

      const fetchedLogs = data as DeploymentLog[];

      setLogs((currentLogs) => {
        const existingLogs = new Set(
          currentLogs.map(
            (log) => `${log.createdAt}-${log.stage}-${log.message}`,
          ),
        );

        const newLogs = fetchedLogs.filter(
          (log) =>
            !existingLogs.has(`${log.createdAt}-${log.stage}-${log.message}`),
        );

        if (newLogs.length === 0) {
          return currentLogs;
        }

        return [...currentLogs, ...newLogs];
      });
    } catch (error) {
      setLogsError(
        error instanceof Error
          ? error.message
          : "Failed to load deployment logs.",
      );
    } finally {
      if (showLoading) {
        setLogsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!logsVisible) {
      return;
    }

    // First fetch when logs are opened.
    void fetchLogs(logs.length === 0);

    const isActive =
      deployment.status !== "SUCCESS" && deployment.status !== "FAILED";

    if (!isActive) {
      return;
    }

    // Poll silently. Existing logs stay on screen and only new logs are added.
    const interval = setInterval(() => {
      void fetchLogs(false);
    }, 2000);

    return () => clearInterval(interval);
  }, [deployment.id, deployment.status, logsVisible]);

  const status = statusStyles[deployment.status];
  const duration = formatDuration(deployment, now);

  function toggleLogs() {
    setLogsVisible((current) => !current);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left transition hover:bg-zinc-50"
      >
        <StatusIcon status={deployment.status} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}
            >
              {status.label}
            </span>

            <span className="font-mono text-xs text-zinc-400">
              {deployment.id.slice(0, 8)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span>{formatDate(deployment.createdAt)}</span>

            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {deployment.completedAt ? duration : `Running for ${duration}`}
            </span>
          </div>
        </div>

        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-zinc-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <GitBranch className="h-4 w-4 text-zinc-400" />
              <span>{deployment.branch}</span>
            </div>

            {deployment.status === "SUCCESS" && deployment.deployedUrl && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-medium text-green-800">
                  Application is live
                </p>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <code className="min-w-0 truncate rounded-lg bg-white px-3 py-2 text-sm text-green-800">
                    {deployment.deployedUrl}
                  </code>

                  <a
                    href={deployment.deployedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-500"
                  >
                    Open
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            )}

            {deployment.status === "FAILED" && deployment.errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">
                  Deployment failed
                </p>

                <p className="mt-2 text-sm text-red-700">
                  Please check the deployment logs for details.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={toggleLogs}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              {logsLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading logs...
                </>
              ) : (
                <>
                  <ScrollText className="h-4 w-4" />
                  {logsVisible ? "Hide logs" : "View logs"}
                </>
              )}
            </button>

            {logsVisible && (
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                  <span className="font-mono text-xs font-medium text-zinc-300">
                    Deployment logs
                  </span>

                  <span className="text-xs text-zinc-500">
                    {logs.length} {logs.length === 1 ? "entry" : "entries"}
                  </span>
                </div>

                <div className="max-h-[400px] space-y-2 overflow-y-auto p-4 font-mono text-xs">
                  {logsLoading && logs.length === 0 && (
                    <div className="flex items-center gap-2 text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Fetching logs...
                    </div>
                  )}

                  {!logsLoading && logsError && (
                    <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-red-300">
                      {logsError}
                    </div>
                  )}

                  {!logsLoading && !logsError && logs.length === 0 && (
                    <p className="text-zinc-500">No logs were recorded.</p>
                  )}

                  {logs.map((log, index) => (
                    <div
                      key={`${log.createdAt}-${log.stage}-${log.message}-${index}`}
                      className="break-words text-zinc-300"
                    >
                      <span className="mr-2 text-zinc-600">
                        {formatLogTime(log.createdAt)}
                      </span>

                      <span className="mr-2 text-blue-400">[{log.stage}]</span>

                      {log.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectsList({
  projects,
  onRedeploy,
  redeployingProjectId,
  activeDeploymentId,
}: ProjectsListProps) {
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    projects.length === 1 ? (projects[0]?.id ?? null) : null,
  );

  useEffect(() => {
    if (!activeDeploymentId) {
      return;
    }

    const project = projects.find((project) =>
      project.deployments.some(
        (deployment) => deployment.id === activeDeploymentId,
      ),
    );

    if (project) {
      setExpandedProjectId(project.id);
    }
  }, [activeDeploymentId, projects]);

  if (projects.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
          <Package className="h-6 w-6 text-zinc-500" />
        </div>

        <h2 className="mt-4 text-lg font-semibold text-zinc-900">
          No projects yet
        </h2>

        <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">
          Deploy a Dockerized GitHub repository to create your first project.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-4">
      {projects.map((project) => {
        const isExpanded = expandedProjectId === project.id;
        const isRedeploying = redeployingProjectId === project.id;

        const successfulDeployments = project.deployments.filter(
          (deployment) => deployment.status === "SUCCESS",
        ).length;

        return (
          <div
            key={project.id}
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() =>
                setExpandedProjectId((current) =>
                  current === project.id ? null : project.id,
                )
              }
              className="flex w-full cursor-pointer flex-col gap-4 p-5 text-left transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <GithubIcon className="h-4 w-4 shrink-0 text-zinc-500" />

                  <h2 className="truncate font-semibold text-zinc-900">
                    {project.name}
                  </h2>
                </div>

                <p className="mt-2 truncate text-sm text-zinc-500">
                  {project.githubRepoUrl.replace(/^https?:\/\//, "")}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Rocket className="h-3.5 w-3.5" />
                    {project.deployments.length}{" "}
                    {project.deployments.length === 1
                      ? "deployment"
                      : "deployments"}
                  </span>

                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    {successfulDeployments} successful
                  </span>

                  <span className="inline-flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5" />
                    {project.branch}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-zinc-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-zinc-400" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-zinc-200 bg-zinc-50 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-zinc-900">
                    Deployment history
                  </h3>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">Newest first</span>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRedeploy(project);
                      }}
                      disabled={isRedeploying}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isRedeploying ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Rocket className="h-3.5 w-3.5" />
                          Redeploy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {project.deployments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
                    No deployments for this project yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {project.deployments.map((deployment) => (
                      <DeploymentRow
                        key={deployment.id}
                        deployment={deployment}
                        shouldAutoOpen={deployment.id === activeDeploymentId}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
