import { prisma } from "@/lib/prisma";

export type GithubRepo = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  updatedAt: string;
  hasDockerfile: boolean;
};

export class GithubApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: "UNAUTHORIZED" | "RATE_LIMITED" | "GITHUB_ERROR",
  ) {
    super(message);
    this.name = "GithubApiError";
  }
}

export async function getValidGithubAccessToken(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "github",
    },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account?.access_token) {
    throw new GithubApiError(
      "GitHub account is not connected. Please sign in again.",
      401,
      "UNAUTHORIZED",
    );
  }

  if (!account.expires_at) {
    return account.access_token;
  }

  const expiresAt = account.expires_at * 1000;
  const isExpired = expiresAt <= Date.now() + 60_000;

  if (!isExpired) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new GithubApiError(
      "GitHub access has expired. Please sign in again.",
      401,
      "UNAUTHORIZED",
    );
  }

  const clientId = process.env.AUTH_GITHUB_ID;
  const clientSecret = process.env.AUTH_GITHUB_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth credentials are not configured");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  const data = await response.json();

  if (
    !response.ok ||
    data.error ||
    !data.access_token ||
    !data.refresh_token ||
    !data.expires_in
  ) {
    console.error("GitHub token refresh failed:", data);

    throw new GithubApiError(
      "GitHub access has expired. Please sign in again.",
      401,
      "UNAUTHORIZED",
    );
  }

  await prisma.account.update({
    where: {
      id: account.id,
    },
    data: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
      token_type: data.token_type,
      scope: data.scope,
    },
  });

  return data.access_token;
}

async function checkDockerfile(
  repo: {
    full_name: string;
    default_branch: string;
  },
  accessToken: string,
): Promise<boolean> {
  const url = new URL(
    `https://api.github.com/repos/${repo.full_name}/contents/Dockerfile`,
  );

  url.searchParams.set("ref", repo.default_branch);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "SkyDeploy",
    },
  });

  if (response.status === 200) {
    return true;
  }

  if (response.status === 404) {
    return false;
  }

  console.error(
    `Failed to check Dockerfile for ${repo.full_name}: ${response.status}`,
  );

  return false;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

export async function fetchGithubRepos(
  accessToken: string,
): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  const perPage = 100;
  const maxPages = 5;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL("https://api.github.com/user/repos");

    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", "updated");

    url.searchParams.set(
      "affiliation",
      "owner,collaborator,organization_member",
    );

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "SkyDeploy",
      },
    });

    if (response.status === 401) {
      throw new GithubApiError(
        "GitHub token is invalid or expired. Please sign in again.",
        401,
        "UNAUTHORIZED",
      );
    }

    if (response.status === 403) {
      const remaining = response.headers.get("x-ratelimit-remaining");

      if (remaining === "0") {
        throw new GithubApiError(
          "GitHub API rate limit exceeded. Please try again later.",
          429,
          "RATE_LIMITED",
        );
      }

      throw new GithubApiError(
        "GitHub denied the repository request.",
        403,
        "GITHUB_ERROR",
      );
    }

    if (!response.ok) {
      throw new GithubApiError(
        "Failed to fetch GitHub repositories.",
        502,
        "GITHUB_ERROR",
      );
    }

    const pageRepos = (await response.json()) as Array<{
      id: number;
      name: string;
      full_name: string;
      html_url: string;
      clone_url: string;
      private: boolean;
      default_branch: string;
      description: string | null;
      updated_at: string;
    }>;

    const reposWithDockerStatus = await mapWithConcurrency(
      pageRepos,
      5,
      async (repo) => {
        const hasDockerfile = await checkDockerfile(repo, accessToken);

        return {
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          htmlUrl: repo.html_url,
          cloneUrl: repo.clone_url,
          private: repo.private,
          defaultBranch: repo.default_branch,
          description: repo.description,
          updatedAt: repo.updated_at,
          hasDockerfile,
        };
      },
    );

    repos.push(...reposWithDockerStatus);

    if (pageRepos.length < perPage) {
      break;
    }
  }

  return repos;
}
