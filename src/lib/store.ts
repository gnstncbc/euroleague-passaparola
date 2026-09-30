import "server-only";
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import seed from "@/data/seed-questions.json";
import type { Question } from "./types";

const HASH = "pp:questions";
const SEED_VERSION = "pp:seedVersion";
const DELETED = "pp:deleted";

const seedList = seed as Question[];
// Changes whenever questions are added to the seed file, so new defaults get
// merged into an existing database without touching edited or deleted ones.
const seedVersion = `v1-${createHash("sha1").update(seedList.map((q) => q.id).join(",")).digest("hex")}`;

export type StoreKind = "redis" | "memory";

// Vercel's Upstash integration names the variables after the chosen prefix
// (KV_REST_API_URL by default, e.g. STORAGE_KV_REST_API_URL otherwise).
function envPair(): { url: string; token: string } | null {
  const env = process.env;
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    return { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN };
  }
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN };
  }
  for (const key of Object.keys(env)) {
    if (!key.endsWith("_REST_API_URL")) continue;
    const token = env[key.replace(/_URL$/, "_TOKEN")];
    if (env[key] && token) return { url: env[key]!, token };
  }
  return null;
}

function redisClient(): Redis | null {
  const pair = envPair();
  return pair ? new Redis(pair) : null;
}

const redis = redisClient();
export const storeKind: StoreKind = redis ? "redis" : "memory";

// Without Redis (local dev) questions live in memory and reset on restart.
const g = globalThis as unknown as { __ppMemory?: Map<string, Question> };
function memory(): Map<string, Question> {
  if (!g.__ppMemory) {
    g.__ppMemory = new Map(seedList.map((q) => [q.id, q]));
  }
  return g.__ppMemory;
}

async function ensureSeeded(r: Redis) {
  if (String(await r.get(SEED_VERSION)) === seedVersion) return;
  const [ids, deleted] = await Promise.all([r.hkeys(HASH), r.smembers(DELETED)]);
  const skip = new Set([...ids, ...deleted]);
  const missing = seedList.filter((q) => !skip.has(q.id));
  if (missing.length) await r.hset(HASH, Object.fromEntries(missing.map((q) => [q.id, q])));
  await r.set(SEED_VERSION, seedVersion);
}

function sortQuestions(list: Question[]) {
  return list.sort((a, b) => a.letter.localeCompare(b.letter) || a.id.localeCompare(b.id));
}

export async function listQuestions(): Promise<Question[]> {
  if (!redis) return sortQuestions([...memory().values()]);
  await ensureSeeded(redis);
  const all = await redis.hgetall<Record<string, Question>>(HASH);
  return sortQuestions(Object.values(all ?? {}));
}

export async function saveQuestion(q: Question): Promise<void> {
  if (!redis) {
    memory().set(q.id, q);
    return;
  }
  await ensureSeeded(redis);
  await redis.hset(HASH, { [q.id]: q });
}

export async function deleteQuestion(id: string): Promise<void> {
  if (!redis) {
    memory().delete(id);
    return;
  }
  await redis.hdel(HASH, id);
  // Remember deleted default questions so a seed update does not restore them.
  await redis.sadd(DELETED, id);
}

export async function replaceAll(list: Question[]): Promise<void> {
  if (!redis) {
    g.__ppMemory = new Map(list.map((q) => [q.id, q]));
    return;
  }
  const kept = new Set(list.map((q) => q.id));
  const dropped = seedList.filter((q) => !kept.has(q.id)).map((q) => q.id);
  const tx = redis.multi();
  tx.del(HASH);
  tx.del(DELETED);
  if (list.length) tx.hset(HASH, Object.fromEntries(list.map((q) => [q.id, q])));
  if (dropped.length) tx.sadd(DELETED, dropped[0], ...dropped.slice(1));
  tx.set(SEED_VERSION, seedVersion);
  await tx.exec();
}

export function defaultQuestions(): Question[] {
  return seedList;
}
