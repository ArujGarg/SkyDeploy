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

export async function fetchGithubRepos(accessToken: string): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  const perPage = 100;
  const maxPages = 5;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL("https://api.github.com/user/repos");
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", "updated");
    url.searchParams.set("affiliation", "owner,collaborator,organization_member");

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

    for (const repo of pageRepos) {
      repos.push({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        private: repo.private,
        defaultBranch: repo.default_branch,
        description: repo.description,
        updatedAt: repo.updated_at,
      });
    }

    if (pageRepos.length < perPage) {
      break;
    }
  }

  return repos;
}
