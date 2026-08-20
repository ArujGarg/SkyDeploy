import { auth } from "@/auth";

export const runtime = "nodejs";

const EXPRESS_API_URL = process.env.EXPRESS_API_URL ?? "http://localhost:3001";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Sign in with GitHub to deploy a repository." },
      { status: 401 },
    );
  }

  const internalSecret = process.env.INTERNAL_API_SECRET;

  if (!internalSecret) {
    return Response.json(
      { message: "INTERNAL_API_SECRET is not configured." },
      { status: 500 },
    );
  }

  let body: { githubRepoUrl?: string; branch?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  try {
    const response = await fetch(`${EXPRESS_API_URL}/api/deployments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-secret": internalSecret,
      },
      body: JSON.stringify({
        githubRepoUrl: body.githubRepoUrl,
        branch: body.branch,
        userId: session.user.id,
      }),
    });

    const data = await response.json().catch(() => ({
      message: "Failed to create deployment",
    }));

    return Response.json(data, { status: response.status });
  } catch (error) {
    console.error(error);

    return Response.json(
      { message: "Failed to reach the deployment API." },
      { status: 502 },
    );
  }
}
