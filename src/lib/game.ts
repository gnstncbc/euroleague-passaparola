import { LETTERS, type Question } from "./types";

export type Status = "pending" | "current" | "correct" | "wrong" | "passed";

export interface Slot {
  q: Question;
  status: Exclude<Status, "current">;
  guess?: string;
}

export const GAME_MS = 4 * 60 * 1000;

const SEEN_KEY = "pp:seen";

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

// One random question per letter, preferring ones not played recently.
export function buildRound(questions: Question[]): Slot[] {
  const seen = readSeen();
  const slots: Slot[] = [];
  for (const letter of LETTERS) {
    const pool = questions.filter((q) => q.letter === letter);
    if (!pool.length) continue;
    const fresh = pool.filter((q) => !seen.has(q.id));
    const from = fresh.length ? fresh : pool;
    if (!fresh.length) pool.forEach((q) => seen.delete(q.id));
    const q = from[Math.floor(Math.random() * from.length)];
    seen.add(q.id);
    slots.push({ q, status: "pending" });
  }
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {}
  return slots;
}

// Next unresolved slot after `from`, wrapping around; -1 when none left.
export function nextOpen(slots: Slot[], from: number): number {
  const n = slots.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (slots[i].status === "pending" || slots[i].status === "passed") return i;
  }
  return -1;
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface GameRecord {
  at: number;
  correct: number;
  wrong: number;
  total: number;
  ms: number;
}

export interface Stats {
  played: number;
  best: number;
  totalCorrect: number;
  history: GameRecord[];
}

const STATS_KEY = "pp:stats";
const HISTORY_LIMIT = 200;

const emptyStats = (): Stats => ({ played: 0, best: 0, totalCorrect: 0, history: [] });

export function readStats(): Stats {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY) ?? "null");
    if (s && typeof s.played === "number") {
      return { ...emptyStats(), ...s, history: Array.isArray(s.history) ? s.history : [] };
    }
  } catch {}
  return emptyStats();
}

function writeStats(s: Stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {}
}

export function recordGame(game: Omit<GameRecord, "at">): Stats {
  const s = readStats();
  const next: Stats = {
    played: s.played + 1,
    best: Math.max(s.best, game.correct),
    totalCorrect: s.totalCorrect + game.correct,
    history: [...s.history, { ...game, at: Date.now() }].slice(-HISTORY_LIMIT),
  };
  writeStats(next);
  return next;
}

export function resetStats(): Stats {
  const s = emptyStats();
  writeStats(s);
  return s;
}
