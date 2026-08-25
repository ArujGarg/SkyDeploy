"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Rocket } from "lucide-react";
import Link from "next/link";
import { ProjectsList } from "@/components/ProjectsList";

export type DeploymentStatus =
  | "QUEUED"
  | "CLONING"
  | "BUILDING"
  | "DEPLOYING"
  | "SUCCESS"
  | "FAILED";

export type DeploymentHistory = {
  id: string;
  status: DeploymentStatus;
  branch: string;
  createdAt: string;
  completedAt: string | null;
  deployedUrl: string | null;
  errorMessage: string | null;
};

export type Project = {
  id: string;
  name: string;
  githubRepoUrl: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
  deployments: DeploymentHistory[];
};

export default function DeploymentsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeployingProjectId, setRedeployingProjectId] = useState<
    string | null
  >(null);

  async function redeployProject(project: Project) {
    try {
      setRedeployingProjectId(project.id);
      setError(null);

      const response = await fetch("/api/deployments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          githubRepoUrl: project.githubRepoUrl,
          branch: project.branch,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to start redeployment.");
      }

      // Reload so the new QUEUED deployment appears.
      await loadProjects();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to start redeployment.",
      );
    } finally {
      setRedeployingProjectId(null);
    }
  }

  async function loadProjects() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/projects", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load projects.");
      }

      setProjects(data.projects ?? []);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to load projects.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to deploy
          </Link>

          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Rocket className="h-4 w-4" />
            SkyDeploy
          </div>
        </div>

        <div className="mt-12">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
            Deployments
          </h1>

          <p className="mt-3 text-zinc-500">
            View your projects and their deployment history.
          </p>
        </div>

        {loading && (
          <div className="mt-12 flex items-center justify-center gap-3 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading projects...
          </div>
        )}

        {!loading && error && (
          <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="font-medium text-red-700">Could not load projects</p>

            <p className="mt-2 text-sm text-red-600">{error}</p>

            <button
              type="button"
              onClick={() => void loadProjects()}
              className="mt-4 cursor-pointer rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && (
          <ProjectsList
            projects={projects}
            onRedeploy={redeployProject}
            redeployingProjectId={redeployingProjectId}
          />
        )}
      </div>
    </main>
  );
}
