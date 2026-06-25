export type Project = {
  id: string;
  name: string;
  githubRepoUrl: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
  deployments: Deployment[];
};

export type Deployment = {
  id: string;
  status:
    | "QUEUED"
    | "CLONING"
    | "BUILDING"
    | "DEPLOYING"
    | "SUCCESS"
    | "FAILED";

  deployedUrl: string | null;
  errorMessage: string | null;
  subdomain: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeploymentLog = {
  stage: string;
  message: string;
  createdAt: string;
};
