"use client";

import { Loader2, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GithubIcon } from "./icons/Github";
import { createProject } from "@/lib/apis";

export default function CreateProjectForm() {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");

  const mutation = useMutation({
    mutationFn: createProject,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      });

      setName("");
      setRepo("");
      setBranch("main");
    },
  });

  const disabled = mutation.isPending || !name.trim() || !repo.trim();

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl shadow-zinc-200/50">
      <h2 className="text-2xl font-semibold text-zinc-900">Create Project</h2>

      <p className="mt-2 text-sm text-zinc-500">
        Projects represent long-lived applications. Each deployment belongs to a
        project.
      </p>

      <div className="mt-8 grid gap-5">
        <input
          placeholder="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
        />

        <div className="relative">
          <GithubIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />

          <input
            placeholder="https://github.com/user/repository"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-12 pr-4 text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
        </div>

        <input
          placeholder="Branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
        />

        <button
          disabled={disabled}
          onClick={() =>
            mutation.mutate({
              name,
              githubRepoUrl: repo,
              branch,
            })
          }
          className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-3 font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating Project...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Create Project
            </>
          )}
        </button>
      </div>
    </section>
  );
}
