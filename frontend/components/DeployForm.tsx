"use client";

import { useEffect, useState } from "react";
import { Loader2, Rocket, ExternalLink } from "lucide-react";
import { GithubIcon } from "./icons/Github";

const API_URL = "http://localhost:3001/api";

type Deployment = {
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

type DeploymentLog = {
  stage: string;
  message: string;
  createdAt: string;
};

const statusColors = {
  QUEUED: "bg-zinc-100 text-zinc-700 border border-zinc-200",

  CLONING: "bg-blue-50 text-blue-700 border border-blue-200",

  BUILDING: "bg-amber-50 text-amber-700 border border-amber-200",

  DEPLOYING: "bg-purple-50 text-purple-700 border border-purple-200",

  SUCCESS: "bg-green-50 text-green-700 border border-green-200",

  FAILED: "bg-red-50 text-red-700 border border-red-200",
};

export default function DeployForm() {
  const [repoUrl, setRepoUrl] = useState("");

  const [deploymentId, setDeploymentId] = useState<string | null>(null);

  const [deployment, setDeployment] = useState<Deployment | null>(null);

  const [logs, setLogs] = useState<DeploymentLog[]>([]);

  const [loading, setLoading] = useState(false);

  async function deploy() {
    if (!repoUrl.trim()) return;

    try {
      setLoading(true);

      setDeployment(null);
      setLogs([]);
      setDeploymentId(null);

      const response = await fetch(`${API_URL}/deployments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          githubRepoUrl: repoUrl,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create deployment");
      }

      const data = await response.json();

      setDeploymentId(data.id);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!deploymentId) return;

    const interval = setInterval(async () => {
      try {
        const deploymentRes = await fetch(
          `${API_URL}/deployments/${deploymentId}`,
        );

        const deploymentData = await deploymentRes.json();

        setDeployment(deploymentData);

        const logsRes = await fetch(
          `${API_URL}/deployments/${deploymentId}/logs`,
        );

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
    deployment &&
    deployment.status !== "SUCCESS" &&
    deployment.status !== "FAILED";

  return (
    <div className="mx-auto max-w-5xl">
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

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-200/60">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <GithubIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />

            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repository"
              className="
                w-full
                rounded-2xl
                border
                border-zinc-200
                bg-zinc-50
                py-4
                pl-12
                pr-4
                outline-none
                transition
                focus:border-blue-500
                focus:bg-white
              "
            />
          </div>

          <button
            onClick={deploy}
            disabled={loading || !repoUrl || !!isDeploymentActive}
            className="
              flex
              min-w-[170px]
              items-center
              justify-center
              gap-2
              rounded-2xl
              bg-zinc-900
              px-6
              py-4
              font-medium
              text-white
              transition
              hover:bg-zinc-800
              disabled:cursor-not-allowed
              disabled:opacity-50
              cursor-pointer
            "
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : isDeploymentActive ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {deployment?.status}
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                Deploy
              </>
            )}
          </button>
        </div>
      </div>

      {deployment && (
        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Deployment Status</h2>

              <p className="mt-1 text-sm text-zinc-500">
                Deployment ID: {deployment.id}
              </p>
            </div>

            <span
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                statusColors[deployment.status]
              }`}
            >
              {deployment.status}
            </span>
          </div>

          {deployment.status === "SUCCESS" && deployment.deployedUrl && (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5">
              <p className="mb-3 font-medium text-green-700">
                Deployment Successful
              </p>

              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <code className="rounded-lg bg-white px-3 py-2 text-sm">
                  {deployment.deployedUrl}
                </code>

                <a
                  href={deployment.deployedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="
                    flex
                    items-center
                    gap-2
                    rounded-xl
                    bg-green-600
                    px-4
                    py-2
                    font-medium
                    text-white
                    hover:bg-green-500
                  "
                >
                  Open Deployment
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}

          {deployment.status === "FAILED" && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="font-medium text-red-700">Deployment Failed</p>

              <p className="mt-2 text-red-600">{deployment.errorMessage}</p>
            </div>
          )}
        </div>
      )}

      {deploymentId && (
        <div className="mt-8 rounded-3xl bg-zinc-950 p-6 shadow-2xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Live Logs</h2>

            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              Live
            </div>
          </div>

          <div className="max-h-[500px] space-y-3 overflow-y-auto font-mono text-sm">
            {logs.length === 0 && (
              <div className="text-zinc-500">Waiting for logs...</div>
            )}

            {logs.map((log, index) => (
              <div
                key={`${log.createdAt}-${index}`}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-3"
              >
                <span className="mr-2 text-blue-400">[{log.stage}]</span>

                <span className="text-zinc-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
