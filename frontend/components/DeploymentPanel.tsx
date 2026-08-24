"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ExternalLink,
  Loader2,
} from "lucide-react";

export type Deployment = {
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

export type DeploymentLog = {
  stage: string;
  message: string;
  createdAt: string;
};

type DeploymentPanelProps = {
  deployment: Deployment | null;
  logs: DeploymentLog[];
};

const statusColors = {
  QUEUED: "border-zinc-200 bg-zinc-100 text-zinc-700",
  CLONING: "border-blue-200 bg-blue-50 text-blue-700",
  BUILDING: "border-amber-200 bg-amber-50 text-amber-700",
  DEPLOYING: "border-purple-200 bg-purple-50 text-purple-700",
  SUCCESS: "border-green-200 bg-green-50 text-green-700",
  FAILED: "border-red-200 bg-red-50 text-red-700",
};

export function DeploymentPanel({ deployment, logs }: DeploymentPanelProps) {
  const [logsExpanded, setLogsExpanded] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  if (!deployment) return null;

  const isActive =
    deployment.status !== "SUCCESS" && deployment.status !== "FAILED";

  useEffect(() => {
    const container = logsContainerRef.current;

    if (!container || !logsExpanded || !isActive) return;

    if (shouldAutoScrollRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs, logsExpanded, isActive]);

  function handleLogsScroll() {
    const container = logsContainerRef.current;

    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    shouldAutoScrollRef.current = distanceFromBottom < 40;
  }

  function toggleLogs() {
    setLogsExpanded((previous) => !previous);
  }

  return (
    <div className="border-t border-zinc-200 bg-white px-5 py-5">
      {/* Status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {isActive ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-zinc-500" />
          ) : deployment.status === "SUCCESS" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          ) : (
            <CircleAlert className="h-5 w-5 shrink-0 text-red-600" />
          )}

          <div>
            <p className="font-medium text-zinc-900">
              {deployment.status === "SUCCESS"
                ? "Deployment successful"
                : deployment.status === "FAILED"
                  ? "Deployment failed"
                  : "Deployment in progress"}
            </p>

            <p className="mt-0.5 text-sm text-zinc-500">
              {isActive
                ? "SkyDeploy is building and starting your application."
                : `Deployment ${deployment.id}`}
            </p>
          </div>
        </div>

        <span
          className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${
            statusColors[deployment.status]
          }`}
        >
          {deployment.status}
        </span>
      </div>

      {/* Success */}
      {deployment.status === "SUCCESS" && deployment.deployedUrl && (
        <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">
            Your application is live
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <code className="min-w-0 truncate rounded-lg border border-green-100 bg-white px-3 py-2 text-sm text-green-800">
              {deployment.deployedUrl}
            </code>

            <a
              href={deployment.deployedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-500 active:scale-[0.98]"
            >
              Open
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}

      {/* Failure */}
      {deployment.status === "FAILED" && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Deployment failed</p>

          {deployment.errorMessage && (
            <p className="mt-2 text-sm leading-6 text-red-700">
              {deployment.errorMessage}
            </p>
          )}
        </div>
      )}

      {/* Logs */}
      <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-mono text-xs font-medium text-zinc-200">
              Deployment logs
            </span>

            {logs.length > 0 && (
              <span className="font-mono text-[11px] text-zinc-500">
                {logs.length} {logs.length === 1 ? "entry" : "entries"}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {isActive && (
              <span className="hidden items-center gap-2 text-xs text-zinc-400 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Live
              </span>
            )}

            <button
              type="button"
              onClick={toggleLogs}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 active:scale-[0.98]"
              aria-expanded={logsExpanded}
            >
              {logsExpanded ? (
                <>
                  Collapse
                  <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Expand
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {logsExpanded && (
          <div
            ref={logsContainerRef}
            onScroll={handleLogsScroll}
            className="max-h-[420px] space-y-2 overflow-y-auto p-4 font-mono text-xs leading-6"
          >
            {logs.length === 0 ? (
              <div className="flex items-center gap-2 text-zinc-500">
                {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Waiting for logs...</span>
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={`${log.createdAt}-${index}`}
                  className="break-words text-zinc-300"
                >
                  <span className="mr-2 text-blue-400">[{log.stage}]</span>

                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
