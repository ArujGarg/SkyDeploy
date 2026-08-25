import { auth } from "@/auth";

export const runtime = "nodejs";

const EXPRESS_API_URL = process.env.EXPRESS_API_URL ?? "http://localhost:3001";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Sign in to view your projects." },
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

  try {
    const url = new URL(`${EXPRESS_API_URL}/api/projects`);
    url.searchParams.set("userId", session.user.id);

    const response = await fetch(url, {
      headers: {
        "x-internal-api-secret": internalSecret,
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({
      message: "Failed to load projects.",
    }));

    return Response.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { message: "Failed to reach the projects API." },
      { status: 502 },
    );
  }
}
