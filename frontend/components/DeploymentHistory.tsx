"use client";

import { useQuery } from "@tanstack/react-query";
import { getProjectDeployments } from "@/lib/apis";
import { Deployment } from "@/lib/types";
import DeploymentItem from "./DeploymentItem";

type DeploymentHistoryProps = {
  projectId: string;
};

const ACTIVE_STATUSES: Deployment["status"][] = [
  "QUEUED",
  "CLONING",
  "BUILDING",
  "DEPLOYING",
];

export default function DeploymentHistory({
  projectId,
}: DeploymentHistoryProps) {
  const {
    data: deployments,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["deployments", projectId],
    queryFn: () => getProjectDeployments(projectId),

    refetchInterval: (query) => {
      const deployments = query.state.data;

      if (!deployments) return false;

      const hasActiveDeployment = deployments.some((deployment) =>
        ACTIVE_STATUSES.includes(deployment.status),
      );

      return hasActiveDeployment ? 2000 : false;
    },

    refetchOnWindowFocus: false,
  });

  if (isPending) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Deployment History
          </h3>
        </div>

        <div className="space-y-3 p-5">
          {[...Array(3)].map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-lg bg-gray-100"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <h3 className="font-medium text-red-700">Failed to load deployments</h3>

        <p className="mt-1 text-sm text-red-600">
          {error instanceof Error ? error.message : "Something went wrong."}
        </p>
      </div>
    );
  }

  if (!deployments || deployments.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Deployment History
          </h3>
        </div>

        <div className="py-10 text-center">
          <p className="text-sm text-gray-500">No deployments yet.</p>

          <p className="mt-1 text-xs text-gray-400">
            Trigger your first deployment to see it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Deployment History
        </h3>

        <p className="mt-1 text-xs text-gray-500">
          {deployments.length} deployment
          {deployments.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="divide-y divide-gray-200">
        {deployments.map((deployment) => (
          <DeploymentItem key={deployment.id} deployment={deployment} />
        ))}
      </div>
    </div>
  );
}
