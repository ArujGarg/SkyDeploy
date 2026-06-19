"use client";

import { useState } from "react";

type Deployment = {
  id: string;
  githubRepoUrl: string;
  branch: string;
  status: string;
  deployedUrl: string | null;
  errorMessage: string | null;
};

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");

  const [deploymentId, setDeploymentId] = useState("");
  const [deployment, setDeployment] = useState<Deployment | null>(null);

  const [loading, setLoading] = useState(false);

  const handleDeploy = async () => {
    try {
      setLoading(true);

      const res = await fetch("http://localhost:3000/api/deployments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          githubRepoUrl: repoUrl,
          branch,
        }),
      });

      const data = await res.json();

      setDeploymentId(data.id);
      setDeployment(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async () => {
    if (!deploymentId) return;

    try {
      const res = await fetch(
        `http://localhost:3000/api/deployments/${deploymentId}`,
      );

      const data = await res.json();

      setDeployment(data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="mx-auto flex max-w-3xl flex-col px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">SkyDeploy</h1>

        <p className="mt-2 text-zinc-600">Deploy any Dockerized application.</p>

        <div className="mt-10 rounded-2xl border border-zinc-300 bg-white p-6 shadow-sm">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Repository URL
              </label>

              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none transition focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Branch</label>

              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none transition focus:border-zinc-500"
              />
            </div>

            <button
              onClick={handleDeploy}
              disabled={loading}
              className="rounded-lg bg-zinc-900 px-5 py-3 text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Deploy"}
            </button>
          </div>
        </div>

        {deployment && (
          <div className="mt-8 rounded-2xl border border-zinc-300 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Deployment</h2>

              <button
                onClick={refreshStatus}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100"
              >
                Refresh
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <p>
                <span className="font-medium">Deployment ID:</span>{" "}
                {deployment.id}
              </p>

              <p>
                <span className="font-medium">Status:</span> {deployment.status}
              </p>

              <p>
                <span className="font-medium">Repository:</span>{" "}
                {deployment.githubRepoUrl}
              </p>

              <p>
                <span className="font-medium">Branch:</span> {deployment.branch}
              </p>

              <p>
                <span className="font-medium">URL:</span>{" "}
                {deployment.deployedUrl ?? "-"}
              </p>

              <p>
                <span className="font-medium">Error:</span>{" "}
                {deployment.errorMessage ?? "-"}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
