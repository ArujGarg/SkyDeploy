import DeployForm from "@/components/DeployForm";
import {
  GithubApiError,
  fetchGithubRepos,
  type GithubRepo,
} from "@/lib/github";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { LogOut, Rocket } from "lucide-react";
import { GithubIcon } from "@/components/icons/Github";
import { auth, signOut } from "@/auth";

async function loadGithubRepos(userId: string): Promise<{
  repos: GithubRepo[];
  error: string | null;
}> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "github",
    },
    select: {
      access_token: true,
    },
  });

  if (!account?.access_token) {
    return {
      repos: [],
      error: "GitHub is not connected for this account. Please sign in again.",
    };
  }

  try {
    const repos = await fetchGithubRepos(account.access_token);

    return { repos, error: null };
  } catch (error) {
    if (error instanceof GithubApiError) {
      return {
        repos: [],
        error: error.message,
      };
    }

    return {
      repos: [],
      error: "Failed to load GitHub repositories.",
    };
  }
}

export default async function Home() {
  const session = await auth();

  const github =
    session?.user?.id != null
      ? await loadGithubRepos(session.user.id)
      : { repos: [], error: null };

  return (
    <main className="min-h-screen bg-[#f8f9fb] text-zinc-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_50%)]" />

      <div className="relative mx-auto max-w-7xl px-6 py-6">
        {/* Top navigation */}
        <header className="flex items-center justify-between">
          {session && (
            <Link
              href="/deployments"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
            >
              <Rocket className="h-4 w-4" />
              View deployments
            </Link>
          )}

          <div className="flex items-center justify-end">
            {session?.user ? (
              <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt={session.user.name ?? "GitHub user"}
                    className="h-9 w-9 rounded-xl border border-zinc-100"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100">
                    <GithubIcon className="h-4 w-4" />
                  </div>
                )}

                <div className="hidden min-w-0 text-left sm:block">
                  <p className="max-w-[180px] truncate text-sm font-medium leading-tight text-zinc-900">
                    {session.user.name}
                  </p>

                  {session.user.email && (
                    <p className="max-w-[180px] truncate text-xs text-zinc-500">
                      {session.user.email}
                    </p>
                  )}
                </div>

                <div className="h-6 w-px bg-zinc-200" />

                <form
                  action={async () => {
                    "use server";
                    await signOut();
                  }}
                >
                  <button
                    type="submit"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Sign out</span>
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </header>

        {/* Main deploy area */}
        <div className="py-14">
          <DeployForm
            session={session}
            initialRepos={github.repos}
            initialReposError={github.error}
          />
        </div>
      </div>
    </main>
  );
}
