"use client";

import { CheckCircle2, CircleAlert, ExternalLink, Loader2 } from "lucide-react";

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
  QUEUED: "bg-zinc-100 text-zinc-700 border-zinc-200",
  CLONING: "bg-blue-50 text-blue-700 border-blue-200",
  BUILDING: "bg-amber-50 text-amber-700 border-amber-200",
  DEPLOYING: "bg-purple-50 text-purple-700 border-purple-200",
  SUCCESS: "bg-green-50 text-green-700 border-green-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
};

export function DeploymentPanel({ deployment, logs }: DeploymentPanelProps) {
  if (!deployment) return null;

  const isActive =
    deployment.status !== "SUCCESS" && deployment.status !== "FAILED";

  return (
    <div className="border-t border-zinc-200 bg-white px-5 py-5">
      {/* Status header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {isActive ? (
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          ) : deployment.status === "SUCCESS" ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <CircleAlert className="h-5 w-5 text-red-600" />
          )}

          <div>
            <p className="font-medium text-zinc-900">
              {deployment.status === "SUCCESS"
                ? "Deployment successful"
                : deployment.status === "FAILED"
                  ? "Deployment failed"
                  : "Deployment in progress"}
            </p>

            <p className="text-sm text-zinc-500">
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
            <code className="truncate rounded-lg bg-white px-3 py-2 text-sm text-green-800">
              {deployment.deployedUrl}
            </code>

            <a
              href={deployment.deployedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-500"
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
            <p className="mt-2 text-sm text-red-700">
              {deployment.errorMessage}
            </p>
          )}
        </div>
      )}

      {/* Logs */}
      <div className="mt-5 overflow-hidden rounded-xl bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <span className="font-mono text-xs font-medium text-zinc-300">
            Deployment logs
          </span>

          {isActive && (
            <span className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Live
            </span>
          )}
        </div>

        <div className="max-h-[350px] space-y-2 overflow-y-auto p-4 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-zinc-500">Waiting for logs...</p>
          ) : (
            logs.map((log, index) => (
              <div
                key={`${log.createdAt}-${index}`}
                className="break-words text-zinc-300"
              >
                <span className="mr-2 text-blue-400">[{log.stage}]</span>

                {log.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
