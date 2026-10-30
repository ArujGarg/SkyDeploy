import { numberFromEnv } from "./worker.config.js";

// pm2 process names. The primary worker is always running; the autoscaler
// only ever starts and stops the extra one.
export const PRIMARY_WORKER = "skydeploy-worker";
export const EXTRA_WORKER = "skydeploy-worker-2";

// Tunables for the autoscaler. See docs/DESIGN_DECISIONS.md (Part 3).
export const autoscalerConfig = {
  // Counting the primary worker. 2 is about what a 2 vCPU / 1.9 GB server can
  // build at once without running out of memory.
  minWorkers: numberFromEnv("MIN_WORKERS", 1),
  maxWorkers: numberFromEnv("MAX_WORKERS", 2),
  checkIntervalSeconds: numberFromEnv("SCALER_INTERVAL_SECONDS", 15),
  // Start another worker once the oldest queued deployment has waited this long
  // and every running worker is busy.
  scaleUpAfterSeconds: numberFromEnv("SCALE_UP_AFTER_SECONDS", 20),
  // Stop the extra worker after nothing has been waiting for this long.
  scaleDownAfterIdleSeconds: numberFromEnv("SCALE_DOWN_AFTER_IDLE_SECONDS", 120),
  // Never start another worker when less memory than this is available.
  minFreeMemoryMb: numberFromEnv("MIN_FREE_MEMORY_MB", 500),
  // After any change, wait this long before changing again.
  cooldownSeconds: numberFromEnv("SCALER_COOLDOWN_SECONDS", 60),
};

export type ScalerSettings = typeof autoscalerConfig;
