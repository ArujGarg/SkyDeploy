"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Deployment } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import DeploymentLogs from "./DeploymentLogs";

type DeploymentItemProps = {
  deployment: Deployment;
};

export default function DeploymentItem({ deployment }: DeploymentItemProps) {
  const [expanded, setExpanded] = useState(false);

  const shortId = deployment.id.slice(0, 8);

  return (
    <div className="bg-white">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <StatusBadge status={deployment.status} />

            <span className="text-xs text-gray-500">
              {new Date(deployment.createdAt).toLocaleString()}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Deployment
              </p>

              <p className="mt-1 font-mono text-sm text-gray-900">{shortId}</p>
            </div>

            {deployment.deployedUrl && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Live URL
                </p>

                <a
                  href={deployment.deployedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  {deployment.deployedUrl}

                  <ExternalLink size={14} />
                </a>
              </div>
            )}

            {deployment.errorMessage && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-red-600">
                  Error
                </p>

                <p className="mt-1 text-sm text-red-700">
                  {deployment.errorMessage}
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          {expanded ? "Hide Logs" : "Show Logs"}

          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50">
          <DeploymentLogs deployment={deployment} />
        </div>
      )}
    </div>
  );
}
