import { auth } from "@/auth";

export const runtime = "nodejs";

const EXPRESS_API_URL = process.env.EXPRESS_API_URL ?? "http://localhost:3001";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const internalSecret = process.env.INTERNAL_API_SECRET;

  if (!internalSecret) {
    return Response.json(
      { message: "INTERNAL_API_SECRET is not configured." },
      { status: 500 },
    );
  }

  const { id } = await params;

  try {
    const response = await fetch(
      `${EXPRESS_API_URL}/api/deployments/${id}/logs`,
      {
        headers: {
          "x-internal-api-secret": internalSecret,
        },
        cache: "no-store",
      },
    );

    const data = await response.json().catch(() => ({
      message: "Failed to fetch deployment logs",
    }));

    return Response.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error("Failed to fetch deployment logs:", error);

    return Response.json(
      { message: "Failed to reach the deployment API." },
      { status: 502 },
    );
  }
}
