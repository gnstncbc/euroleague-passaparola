import { beforeEach, describe, expect, it, vi } from "vitest";
import seed from "@/data/seed-questions.json";

// Minimal in-memory stand-in for the Upstash client.
const db = { kv: new Map<string, unknown>(), hash: new Map<string, unknown>(), set: new Set<string>() };
class FakeRedis {
  async get(k: string) { return db.kv.get(k) ?? null; }
  async set(k: string, v: unknown) { db.kv.set(k, v); return "OK"; }
  async hkeys() { return [...db.hash.keys()]; }
  async hgetall() { return db.hash.size ? Object.fromEntries(db.hash) : null; }
  async hset(_k: string, obj: Record<string, unknown>) { for (const [f, v] of Object.entries(obj)) db.hash.set(f, v); return 1; }
  async hmget(_k: string, ...f: string[]) { return Object.fromEntries(f.map((x) => [x, db.hash.get(x) ?? null])); }
  async hdel(_k: string, f: string) { db.hash.delete(f); return 1; }
  async smembers() { return [...db.set]; }
  async sadd(_k: string, ...m: string[]) { m.forEach((x) => db.set.add(x)); return m.length; }
  async del(k: string) { if (k.includes("questions")) db.hash.clear(); else db.set.clear(); return 1; }
  multi() {
    const ops: (() => Promise<unknown>)[] = [];
    const tx = new Proxy({}, {
      get: (_t, name: string) => name === "exec"
        ? async () => { for (const op of ops) await op(); return []; }
        : (...args: unknown[]) => { ops.push(() => (this as any)[name](...args)); return tx; },
    });
    return tx;
  }
}
vi.mock("server-only", () => ({}));
vi.mock("@upstash/redis", () => ({ Redis: FakeRedis }));
process.env.KV_REST_API_URL = "http://fake";
process.env.KV_REST_API_TOKEN = "t";

const store = await import("@/lib/store");

describe("redis store seeding", () => {
  beforeEach(() => { db.kv.clear(); db.hash.clear(); db.set.clear(); });

  it("seeds an empty database", async () => {
    expect((await store.listQuestions()).length).toBe(seed.length);
  });

  it("adds new seed questions to an old database without touching edits or deletions", async () => {
    // State of a database seeded by the first version (81 questions, old flag).
    const old = seed.slice(0, 81);
    old.forEach((q) => db.hash.set(q.id, q));
    db.kv.set("pp:seeded", "1");
    db.hash.set("a1", { ...seed[0], question: "EDITED" });
    db.hash.set("custom", { ...seed[0], id: "custom", question: "user added" });
    db.hash.delete(old[5].id); // removed before deletions were tracked

    const list = await store.listQuestions();
    const ids = new Set(list.map((q) => q.id));
    expect(list.find((q) => q.id === "a1")?.question).toBe("EDITED");
    expect(ids.has("custom")).toBe(true);
    for (const q of seed.slice(81)) expect(ids.has(q.id)).toBe(true);
  });

  it("tags stored general questions that predate categories", async () => {
    const general = seed.find((q) => q.category === "general")!;
    seed.forEach((q) => {
      const { category, ...rest } = q;
      db.hash.set(q.id, q.id === general.id ? { ...rest, question: "EDITED" } : q);
    });
    db.kv.set("pp:seedVersion", "v1-old");
    const found = (await store.listQuestions()).find((q) => q.id === general.id)!;
    expect(found.category).toBe("general");
    expect(found.question).toBe("EDITED");
  });

  it("does not restore deleted questions on the next seed update", async () => {
    await store.listQuestions();
    await store.deleteQuestion("b1");
    db.kv.set("pp:seedVersion", "older");
    const ids = (await store.listQuestions()).map((q) => q.id);
    expect(ids).not.toContain("b1");
  });

  it("import keeps only the imported set even after a seed update", async () => {
    await store.listQuestions();
    await store.replaceAll([seed[0] as never]);
    db.kv.set("pp:seedVersion", "older");
    expect((await store.listQuestions()).map((q) => q.id)).toEqual([seed[0].id]);
  });
});
