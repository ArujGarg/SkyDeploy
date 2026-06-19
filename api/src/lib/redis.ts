import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;

console.log("redis url", redisUrl);

if (!redisUrl) {
  throw new Error("REDIS URL is not defined");
}
export const redis = createClient({
  url: redisUrl,
});

redis.on("error", (err) => {
  console.error("Redis Error:", err);
});

export async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}
