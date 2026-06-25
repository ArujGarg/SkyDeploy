"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, FolderGit2 } from "lucide-react";
import ProjectCard from "./ProjectCard";
import { getProjects } from "@/lib/apis";

export default function ProjectList() {
  const {
    data: projects,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
  });

  if (isPending) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-red-600">
        Failed to load projects.
      </div>
    );
  }

  if (!projects?.length) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-16 text-center">
        <FolderGit2 className="mx-auto h-12 w-12 text-zinc-400" />

        <h2 className="mt-6 text-2xl font-semibold text-zinc-900">
          No Projects Yet
        </h2>

        <p className="mt-2 text-zinc-500">
          Create your first project above to start deploying applications.
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900">Your Projects</h2>

          <p className="mt-2 text-zinc-500">
            Manage deployments and monitor application status.
          </p>
        </div>

        <span className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
          {projects.length} Project{projects.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-6">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}
