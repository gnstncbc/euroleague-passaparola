import "server-only";
import { dailyNumber, istanbulDate } from "./day";
import { pickDaily } from "./dailyPick";
import { redisClient } from "./store";
import type { Question } from "./types";

const LAST_USED = "pp:dailyLast";
const dayKey = (date: string) => `pp:daily:${date}`;

export interface Daily {
  date: string;
  number: number;
  questions: Question[];
}

// Question ids for the day, chosen once and shared by every player.
async function dailyIds(questions: Question[], date: string): Promise<string[]> {
  const redis = redisClient();
  if (!redis) return pickDaily(questions, date).map((q) => q.id);

  const existing = await redis.get<string[]>(dayKey(date));
  if (Array.isArray(existing)) return existing;

  const lastUsed = (await redis.hgetall<Record<string, string>>(LAST_USED)) ?? {};
  const ids = pickDaily(questions, date, lastUsed).map((q) => q.id);
  // NX: if another request picked first, use its set.
  const created = await redis.set(dayKey(date), ids, { nx: true, ex: 60 * 60 * 24 * 60 });
  if (!created) {
    const winner = await redis.get<string[]>(dayKey(date));
    if (Array.isArray(winner)) return winner;
  }
  if (ids.length) await redis.hset(LAST_USED, Object.fromEntries(ids.map((id) => [id, date])));
  return ids;
}

/** Drop today's set so the next visit picks a fresh one (admin action). */
export async function regenerateDaily(): Promise<void> {
  const redis = redisClient();
  if (!redis) return;
  const date = istanbulDate();
  const ids = await redis.get<string[]>(dayKey(date));
  if (Array.isArray(ids) && ids.length) {
    const last = (await redis.hmget<Record<string, string | null>>(LAST_USED, ...ids)) ?? {};
    const today = Object.entries(last).filter(([, d]) => d === date).map(([id]) => id);
    if (today.length) await redis.hdel(LAST_USED, ...today);
  }
  await redis.del(dayKey(date));
}

export async function getDaily(questions: Question[]): Promise<Daily> {
  const date = istanbulDate();
  const ids = await dailyIds(questions, date);
  const byId = new Map(questions.map((q) => [q.id, q]));
  // A question deleted during the day is replaced by another for its letter.
  const fallback = pickDaily(questions, date);
  const chosen = ids.map((id) => byId.get(id)).filter((q): q is Question => !!q);
  const letters = new Set(chosen.map((q) => q.letter));
  for (const q of fallback) if (!letters.has(q.letter)) chosen.push(q);
  chosen.sort((a, b) => a.letter.localeCompare(b.letter));
  return { date, number: dailyNumber(date), questions: chosen };
}
