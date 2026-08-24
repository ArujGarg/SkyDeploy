import fs from "node:fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function createNginxConfig(subdomain: string, hostPort: number) {
  const config = `
    server {
        listen 80;
        server_name ${subdomain}.aruj.dev;

        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name ${subdomain}.aruj.dev;

        ssl_certificate /etc/letsencrypt/live/aruj.dev/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/aruj.dev/privkey.pem;

        location / {
            proxy_pass http://127.0.0.1:${hostPort};

            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
  `;

  await fs.writeFile(
    `${process.env.NGINX_CONFIG_DIR}/${subdomain}.conf`,
    config,
  );
}

export async function reloadNginx() {
  await execAsync("sudo /usr/sbin/nginx -s reload");
}

export async function deleteNginxConfig(subdomain: string): Promise<void> {
  try {
    await fs.unlink(`${process.env.NGINX_CONFIG_DIR}/${subdomain}.conf`);
  } catch (error) {
    console.error(`Failed to delete nginx config for ${subdomain}`, error);
  }
}
