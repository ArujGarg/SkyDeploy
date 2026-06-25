import { Project, Deployment, DeploymentLog } from "./types";

const API = "http://localhost:3001/api";

export async function getProjects(): Promise<Project[]> {
  const res = await fetch(`${API}/projects`);

  if (!res.ok) throw new Error("Failed to fetch projects");

  return res.json();
}

export async function createProject(data: {
  name: string;
  githubRepoUrl: string;
  branch: string;
}) {
  const res = await fetch(`${API}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to create project");

  return res.json();
}

export async function deployProject(projectId: string) {
  const res = await fetch(`${API}/projects/${projectId}/deploy`, {
    method: "POST",
  });

  if (!res.ok) throw new Error("Failed to deploy");

  return res.json();
}

export async function getProjectDeployments(
  projectId: string,
): Promise<Deployment[]> {
  const res = await fetch(`${API}/projects/${projectId}/deployments`);

  if (!res.ok) throw new Error("Failed to fetch deployments");

  return res.json();
}

export async function getDeployment(id: string): Promise<Deployment> {
  const res = await fetch(`${API}/deployments/${id}`);

  if (!res.ok) throw new Error("Failed");

  return res.json();
}

export async function getLogs(id: string): Promise<DeploymentLog[]> {
  const res = await fetch(`${API}/deployments/${id}/logs`);

  if (!res.ok) throw new Error("Failed");

  return res.json();
}
