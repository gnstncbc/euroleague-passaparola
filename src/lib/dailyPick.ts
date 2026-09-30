import { LETTERS, type Question } from "./types";

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * One question per letter for the given day. Questions never used in a daily
 * puzzle come first, then the ones used longest ago; ties are broken by a
 * hash of the date so the pick is stable but not alphabetical.
 */
export function pickDaily(
  questions: Question[],
  date: string,
  lastUsed: Record<string, string> = {},
): Question[] {
  const picked: Question[] = [];
  for (const letter of LETTERS) {
    const pool = questions.filter((q) => q.letter === letter);
    if (!pool.length) continue;
    pool.sort(
      (a, b) =>
        (lastUsed[a.id] ?? "").localeCompare(lastUsed[b.id] ?? "") ||
        hash(`${date}:${a.id}`) - hash(`${date}:${b.id}`),
    );
    picked.push(pool[0]);
  }
  return picked;
}
