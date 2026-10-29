import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS URL is not defined");
}

// Redis is only a "wake-up" channel; Postgres holds the real state. So code
// must never wait on Redis: with disableOfflineQueue a command sent while
// Redis is disconnected fails immediately instead of waiting for it to return.
// The client itself keeps reconnecting in the background, forever.
export const redis = createClient({
  url: redisUrl,
  disableOfflineQueue: true,
});

// The few things the helpers below need from a client. A structural type,
// because a duplicate() of the client has a different (but compatible) type.
type RedisConnection = {
  isOpen: boolean;
  isReady: boolean;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  destroy(): void;
  on(event: "error", listener: (error: Error) => void): unknown;
};

// The client emits an error on every failed reconnect attempt. Print one every
// 30 seconds so an outage does not flood the logs.
const ERROR_LOG_INTERVAL_MS = 30_000;
const lastErrorLoggedAt = new WeakMap<object, number>();

function logRedisErrors(client: RedisConnection, name: string) {
  // An 'error' event with no listener would crash the process, so every client
  // (including duplicates, which do not inherit listeners) needs one.
  client.on("error", (error: Error) => {
    const now = Date.now();

    if (now - (lastErrorLoggedAt.get(client) ?? 0) < ERROR_LOG_INTERVAL_MS) {
      return;
    }

    lastErrorLoggedAt.set(client, now);
    console.error(`Redis (${name}) error: ${error.message}`);
  });
}

logRedisErrors(redis, "main");

/** A separate connection, for commands that block (BRPOP holds its socket). */
export function createBlockingRedisClient() {
  const client = redis.duplicate();

  logRedisErrors(client, "blocking");

  return client;
}

/**
 * Starts connecting in the background and returns immediately. Whether Redis
 * is reachable must never decide whether the process can start.
 */
export function connectRedis(client: RedisConnection = redis) {
  if (!client.isOpen) {
    client.connect().catch((error: Error) => {
      console.error(`Redis could not connect: ${error.message}`);
    });
  }
}

export function isRedisReady() {
  return redis.isReady;
}

export async function closeRedis(client: RedisConnection) {
  if (!client.isOpen) {
    return;
  }

  // quit() asks Redis to close and waits for the reply, which never comes if
  // we are not connected (during an outage), so just drop the socket then.
  if (!client.isReady) {
    client.destroy();

    return;
  }

  try {
    await Promise.race([
      client.quit(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("quit timed out")), 2000),
      ),
    ]);
  } catch {
    client.destroy();
  }
}
