import { auth } from "@/auth";
import {
  GithubApiError,
  fetchGithubRepos,
  getValidGithubAccessToken,
} from "@/lib/github";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Sign in with GitHub to view repositories." },
      { status: 401 },
    );
  }

  try {
    const accessToken = await getValidGithubAccessToken(session.user.id);

    const repos = await fetchGithubRepos(accessToken);

    return Response.json({ repos });
  } catch (error) {
    if (error instanceof GithubApiError) {
      return Response.json(
        {
          message: error.message,
          code: error.code,
        },
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
