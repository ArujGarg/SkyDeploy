import fs from "node:fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function createNginxConfig(subdomain: string, hostPort: number) {
  const config = `
  server {
      listen 80;
  
      server_name ${subdomain}.localhost;
  
      location / {
          proxy_pass http://127.0.0.1:${hostPort};
      }
  }
  `;

  await fs.writeFile(
    `${process.env.NGINX_CONFIG_DIR}/${subdomain}.conf`,
    config,
  );
}

export async function reloadNginx() {
  await execAsync("nginx -s reload");
}

export async function deleteNginxConfig(subdomain: string): Promise<void> {
  try {
    await fs.unlink(`${process.env.NGINX_CONFIG_DIR}/${subdomain}.conf`);
  } catch (error) {
    console.error(`Failed to delete nginx config for ${subdomain}`, error);
  }
}
