import DeployForm from "@/components/DeployForm";
import { auth } from "@/auth";
import { GithubApiError, fetchGithubRepos, type GithubRepo } from "@/lib/github";
import { prisma } from "@/lib/prisma";

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
      error:
        "GitHub is not connected for this account. Please sign in again.",
    };
  }

  try {
    const repos = await fetchGithubRepos(account.access_token);
    return { repos, error: null };
  } catch (error) {
    if (error instanceof GithubApiError) {
      return { repos: [], error: error.message };
    }

    return { repos: [], error: "Failed to load GitHub repositories." };
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

      <div className="relative mx-auto max-w-7xl px-6 py-20">
        <DeployForm
          session={session}
          initialRepos={github.repos}
          initialReposError={github.error}
        />
      </div>
    </main>
  );
}
