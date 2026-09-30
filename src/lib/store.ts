import "server-only";
import { Redis } from "@upstash/redis";
import seed from "@/data/seed-questions.json";
import type { Question } from "./types";

const HASH = "pp:questions";
const SEEDED = "pp:seeded";

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
    g.__ppMemory = new Map((seed as Question[]).map((q) => [q.id, q]));
  }
  return g.__ppMemory;
}

async function ensureSeeded(r: Redis) {
  // SET NX so concurrent first requests seed only once; deleting every
  // question later does not bring the defaults back.
  const first = await r.set(SEEDED, "1", { nx: true });
  if (first) {
    const entries = Object.fromEntries((seed as Question[]).map((q) => [q.id, q]));
    await r.hset(HASH, entries);
  }
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
}

export async function replaceAll(list: Question[]): Promise<void> {
  if (!redis) {
    g.__ppMemory = new Map(list.map((q) => [q.id, q]));
    return;
  }
  const tx = redis.multi();
  tx.set(SEEDED, "1");
  tx.del(HASH);
  if (list.length) tx.hset(HASH, Object.fromEntries(list.map((q) => [q.id, q])));
  await tx.exec();
}

export function defaultQuestions(): Question[] {
  return seed as Question[];
}
