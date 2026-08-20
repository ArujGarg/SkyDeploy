import { auth } from "@/auth";
import { GithubApiError, fetchGithubRepos } from "@/lib/github";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Sign in with GitHub to view repositories." },
      { status: 401 },
    );
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "github",
    },
    select: {
      access_token: true,
    },
  });

  if (!account?.access_token) {
    return Response.json(
      {
        message:
          "GitHub is not connected for this account. Please sign in again.",
        code: "GITHUB_TOKEN_MISSING",
      },
      { status: 401 },
    );
  }

  try {
    const repos = await fetchGithubRepos(account.access_token);
    return Response.json({ repos });
  } catch (error) {
    if (error instanceof GithubApiError) {
      return Response.json(
        { message: error.message, code: error.code },
        { status: error.status },
      );
    }

    console.error(error);

    return Response.json(
      { message: "Failed to load GitHub repositories." },
      { status: 500 },
    );
  }
}
