// pm2 process definitions. Apply with: pm2 startOrReload ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "skydeploy-api",
      script: "src/index.ts",
      interpreter: "node",
      node_args: "--import tsx",
    },
    {
      name: "skydeploy-worker",
      script: "src/worker.ts",
      interpreter: "node",
      node_args: "--import tsx",
      // On stop/restart pm2 sends SIGINT, then SIGKILL after kill_timeout.
      // The worker finishes its current job on SIGINT, so give it time to.
      // Keep this above the longest expected deployment.
      kill_timeout: 10 * 60 * 1000,
      // By default pm2 signals the whole process tree. SIGINT makes a child
      // `docker build` cancel itself, which would defeat the graceful
      // shutdown. Only signal the worker; it lets the build finish.
      treekill: false,
    },
  ],
};
