"use client";

import { useQuery } from "@tanstack/react-query";

import { getLogs } from "@/lib/apis";
import { Deployment } from "@/lib/types";

type DeploymentLogsProps = {
  deployment: Deployment;
};

const ACTIVE_STATUSES: Deployment["status"][] = [
  "QUEUED",
  "CLONING",
  "BUILDING",
  "DEPLOYING",
];

export default function DeploymentLogs({ deployment }: DeploymentLogsProps) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["deployment-logs", deployment.id],
    queryFn: () => getLogs(deployment.id),

    refetchInterval: ACTIVE_STATUSES.includes(deployment.status) ? 2000 : false,

    refetchOnWindowFocus: false,
  });

  if (isPending) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-500">Loading logs...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">Failed to load deployment logs.</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-500">No logs available yet.</p>
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto">
      {data.map((log, index) => (
        <div
          key={index}
          className="border-b border-gray-200 px-5 py-3 last:border-b-0"
        >
          <div className="flex items-center justify-between gap-4">
            <span className="rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700">
              {log.stage}
            </span>

            <span className="text-xs text-gray-500">
              {new Date(log.createdAt).toLocaleTimeString()}
            </span>
          </div>

          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">
            {log.message}
          </p>
        </div>
      ))}
    </div>
  );
}
