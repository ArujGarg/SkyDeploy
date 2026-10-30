// pm2 process definitions. Apply with: pm2 startOrReload ecosystem.config.cjs
const base = {
  interpreter: "node",
  node_args: "--import tsx",
  // Without a delay, a process that crashes at startup is restarted so
  // fast that pm2 gives up after 16 tries and leaves it stopped. With
  // this, restarts slow down (1s, 1.5s, ... up to 15s) and never stop.
  exp_backoff_restart_delay: 1000,
};

const worker = {
  ...base,
  script: "src/worker.ts",
  // On stop/restart pm2 sends SIGINT, then SIGKILL after kill_timeout.
  // The worker finishes its current job on SIGINT, so give it time to.
  // Keep this above the longest expected deployment.
  kill_timeout: 10 * 60 * 1000,
  // By default pm2 signals the whole process tree. SIGINT makes a child
  // `docker build` cancel itself, which would defeat the graceful
  // shutdown. Only signal the worker; it lets the build finish.
  treekill: false,
};

module.exports = {
  apps: [
    {
      ...base,
      name: "skydeploy-api",
      script: "src/index.ts",
    },
    {
      ...worker,
      name: "skydeploy-worker",
    },
    {
      // The extra worker. The autoscaler starts and stops it with
      // `pm2 start/stop skydeploy-worker-2`, so pm2 must not start it itself.
      ...worker,
      name: "skydeploy-worker-2",
      autostart: false,
    },
    {
      ...base,
      name: "skydeploy-autoscaler",
      script: "src/autoscaler.ts",
    },
  ],
};
