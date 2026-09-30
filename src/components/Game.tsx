"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isCorrect } from "@/lib/match";
import type { Question } from "@/lib/types";
import {
  buildRound, formatTime, GAME_MS, nextOpen, readStats, recordGame, resetStats,
  type Slot, type Stats,
} from "@/lib/game";
import Ring from "./Ring";
import StatsPanel from "./StatsPanel";
import s from "./Game.module.css";

type Phase = "idle" | "playing" | "paused" | "done";
type Feedback = { kind: "correct" | "wrong" | "passed"; text: string; key: number } | null;

// Keeps --vvh / --vvt in sync with the visual viewport so the layout
// shrinks above the on-screen keyboard (iOS does not resize the page).
function useVisualViewport() {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const update = () => {
      const h = vv ? vv.height : window.innerHeight;
      setHeight(h);
      root.style.setProperty("--vvh", `${h}px`);
      root.style.setProperty("--vvt", `${vv ? vv.offsetTop : 0}px`);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return height;
}

export default function Game({ questions }: { questions: Question[] }) {
  const viewportHeight = useVisualViewport();
  const [phase, setPhase] = useState<Phase>("idle");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(GAME_MS);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastAction = useRef(0);
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;

  useEffect(() => setStats(readStats()), []);

  const finish = useCallback((final: Slot[]) => {
    setPhase("done");
    setStats(
      recordGame({
        correct: final.filter((x) => x.status === "correct").length,
        wrong: final.filter((x) => x.status === "wrong").length,
        total: final.length,
        ms: GAME_MS - Math.max(0, remainingRef.current),
      }),
    );
    inputRef.current?.blur();
  }, []);

  // Countdown
  useEffect(() => {
    if (phase !== "playing") return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setRemaining((r) => Math.max(0, r - dt));
    }, 200);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && remaining <= 0) finish(slots);
  }, [remaining, phase, slots, finish]);

  // Pause when the tab/app goes to the background.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) setPhase((p) => (p === "playing" ? "paused" : p));
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus());

  const start = () => {
    const round = buildRound(questions);
    if (!round.length) return;
    setSlots(round);
    setCurrent(0);
    setRemaining(GAME_MS);
    setGuess("");
    setFeedback(null);
    setCopied(false);
    setPhase("playing");
    focusInput();
  };

  const resolve = (status: "correct" | "wrong" | "passed", typed?: string) => {
    const now = Date.now();
    if (now - lastAction.current < 350) return; // swallow accidental double taps
    lastAction.current = now;
    const slot = slots[current];
    const next = slots.map((x, i) => (i === current ? { ...x, status, guess: typed ?? x.guess } : x));
    setSlots(next);
    setGuess("");
    setFeedback({
      kind: status,
      key: now,
      text:
        status === "correct" ? slot.q.answer : status === "wrong" ? slot.q.answer : `${slot.q.letter} — pas`,
    });
    const n = nextOpen(next, current);
    if (n === -1) finish(next);
    else setCurrent(n);
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (phase !== "playing") return;
    const typed = guess.trim();
    if (!typed || typed.toLocaleLowerCase("tr") === "pas") return resolve("passed");
    const q = slots[current].q;
    resolve(isCorrect(typed, q.answer, q.alternates) ? "correct" : "wrong", typed);
  };

  const pause = () => {
    setPhase("paused");
    inputRef.current?.blur();
  };
  const resume = () => {
    setPhase("playing");
    focusInput();
  };

  const openHelp = () => {
    if (phase === "playing") pause();
    setHelpOpen(true);
  };

  const counts = useMemo(() => {
    const c = { correct: 0, wrong: 0, open: 0 };
    for (const x of slots) {
      if (x.status === "correct") c.correct++;
      else if (x.status === "wrong") c.wrong++;
      else c.open++;
    }
    return c;
  }, [slots]);

  const shareText = () => {
    const squares = slots
      .map((x) => (x.status === "correct" ? "🟩" : x.status === "wrong" ? "🟥" : "⬜"))
      .join("");
    const rows = squares.match(/(?:🟩|🟥|⬜){1,13}/gu)?.join("\n") ?? squares;
    return `Passaparola · EuroLeague 🏀\n${counts.correct}/${slots.length} doğru · ${formatTime(
      GAME_MS - remaining,
    )}\n${rows}\n${window.location.origin}`;
  };

  const share = async () => {
    const text = shareText();
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const ringStatuses = slots.map((x, i) =>
    (phase === "playing" || phase === "paused") && i === current ? "current" : x.status,
  );
  const active = slots[current];
  const lowTime = remaining < 30_000;
  const inGame = phase === "playing" || phase === "paused";
  // Short viewport (e.g. phone keyboard open): swap the ring for a slim bar.
  const compact = inGame && viewportHeight !== null && viewportHeight < 520;

  return (
    <div className={s.app}>
      <header className={s.header}>
        <button className={s.iconBtn} onClick={openHelp} aria-label="Nasıl oynanır">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="17.2" r="1.1" fill="currentColor" />
          </svg>
        </button>
        <h1 className={s.title}>
          Passaparola<span className={s.titleSub}>EuroLeague</span>
        </h1>
        {phase === "playing" ? (
          <button className={s.iconBtn} onClick={pause} aria-label="Duraklat">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <rect x="7" y="5.5" width="3.2" height="13" rx="1" fill="currentColor" />
              <rect x="13.8" y="5.5" width="3.2" height="13" rx="1" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button className={s.iconBtn} onClick={() => setStatsOpen(true)} aria-label="İstatistikler">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <rect x="4" y="12" width="3.6" height="8" rx="1" fill="currentColor" />
              <rect x="10.2" y="7" width="3.6" height="13" rx="1" fill="currentColor" />
              <rect x="16.4" y="4" width="3.6" height="16" rx="1" fill="currentColor" />
            </svg>
          </button>
        )}
      </header>

      <main className={`${s.main} ${phase === "done" ? s.mainScroll : ""}`}>
        {compact && (
          <div className={s.compactBar}>
            <div className={s.compactTop}>
              <span className={s.compactLetter}>{active?.q.letter}</span>
              <span className={`${s.compactTimer} ${lowTime ? s.timerLow : ""}`}>{formatTime(remaining)}</span>
              <span className={s.centerMeta}>
                <span className={s.dotGreen} /> {counts.correct}
                <span className={s.dotRed} /> {counts.wrong}
              </span>
            </div>
            <div className={s.strip}>
              {ringStatuses.map((st, i) => (
                <span key={i} className={`${s.seg} ${s["seg_" + st]}`} />
              ))}
            </div>
          </div>
        )}
        <div className={s.stage} hidden={compact}>
          <Ring
            letters={slots.length ? slots.map((x) => x.q.letter) : undefined}
            statuses={ringStatuses}
          >
            {phase === "idle" && (
              <button className={s.startBtn} onClick={start} disabled={!questions.length}>
                Başla
              </button>
            )}
            {(phase === "playing" || phase === "paused") && (
              <div className={s.center}>
                <div className={`${s.timer} ${lowTime ? s.timerLow : ""}`}>{formatTime(remaining)}</div>
                <div className={s.centerMeta}>
                  <span className={s.dotGreen} /> {counts.correct}
                  <span className={s.dotRed} /> {counts.wrong}
                </div>
              </div>
            )}
            {phase === "done" && (
              <div className={s.center}>
                <div className={s.score}>
                  {counts.correct}
                  <span>/{slots.length}</span>
                </div>
                <div className={s.centerMeta}>doğru</div>
              </div>
            )}
          </Ring>
        </div>

        {phase === "idle" && (
          <section className={s.intro}>
            <p className={s.lead}>
              A&apos;dan Z&apos;ye her harf için bir <strong>modern EuroLeague</strong> sorusu. Süren{" "}
              <strong>4 dakika</strong>.
            </p>
            <ul className={s.rules}>
              <li>Bilmiyorsan <strong>Pas</strong> geç; tur bitince o harfe geri dönersin.</li>
              <li>Küçük yazım hataları ve eksik yazılan isimler kabul edilir.</li>
              <li>Kişi isimlerinde harf genelde soyadına aittir.</li>
            </ul>
            {stats && stats.played > 0 && (
              <button className={s.statsLink} onClick={() => setStatsOpen(true)}>
                {stats.played} oyun · en iyi {stats.best} · istatistikler →
              </button>
            )}
            {!questions.length && <p className={s.statsLine}>Henüz soru eklenmemiş.</p>}
          </section>
        )}

        {(phase === "playing" || phase === "paused") && active && (
          <section className={s.play}>
            <div className={s.questionWrap}>
              {phase === "paused" ? (
                <div className={s.pausedBox}>
                  <p>Duraklatıldı</p>
                  <div className={s.row}>
                    <button className={s.primary} onClick={resume}>Devam et</button>
                    <button className={s.ghost} onClick={() => finish(slots)}>Bitir</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`${s.rule} ${active.q.rule === "contains" ? s.ruleContains : ""}`}>
                    {active.q.rule === "starts" ? (
                      <><b>{active.q.letter}</b> ile başlar</>
                    ) : (
                      <>İçinde <b>{active.q.letter}</b> geçer</>
                    )}
                  </div>
                  <p key={active.q.id} className={s.question}>{active.q.question}</p>
                </>
              )}
            </div>

            <div className={s.feedbackSlot} aria-live="polite">
              {feedback && (
                <div key={feedback.key} className={`${s.feedback} ${s[feedback.kind]}`}>
                  {feedback.kind === "correct" ? "✓ " : feedback.kind === "wrong" ? "✗ Cevap: " : ""}
                  {feedback.text}
                </div>
              )}
            </div>

            <form className={s.answerRow} onSubmit={submit}>
              <input
                ref={inputRef}
                className={s.input}
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Cevabın…"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="words"
                spellCheck={false}
                enterKeyHint="send"
                disabled={phase !== "playing"}
                aria-label="Cevap"
              />
              <button
                type="button"
                className={s.passBtn}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => resolve("passed")}
                disabled={phase !== "playing"}
              >
                Pas
              </button>
              <button
                type="submit"
                className={s.sendBtn}
                onPointerDown={(e) => e.preventDefault()}
                disabled={phase !== "playing"}
                aria-label="Cevapla"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                  <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </section>
        )}

        {phase === "done" && (
          <section className={s.result}>
            <div className={s.tally}>
              <div><strong>{counts.correct}</strong><span>Doğru</span></div>
              <div><strong>{counts.wrong}</strong><span>Yanlış</span></div>
              <div><strong>{counts.open}</strong><span>Boş</span></div>
              <div><strong>{formatTime(GAME_MS - remaining)}</strong><span>Süre</span></div>
            </div>
            <div className={s.row}>
              <button className={s.primary} onClick={share}>{copied ? "Kopyalandı ✓" : "Paylaş"}</button>
              <button className={s.ghost} onClick={start}>Tekrar oyna</button>
            </div>
            {stats && (
              <button className={s.statsLink} onClick={() => setStatsOpen(true)}>
                {stats.played} oyun · en iyi {stats.best} · ortalama{" "}
                {(stats.played ? stats.totalCorrect / stats.played : 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} · istatistikler →
              </button>
            )}
            <ol className={s.review}>
              {slots.map((x) => (
                <li key={x.q.id} className={s.reviewItem}>
                  <span className={`${s.reviewLetter} ${s["st_" + x.status]}`}>{x.q.letter}</span>
                  <div>
                    <p className={s.reviewQ}>{x.q.question}</p>
                    <p className={s.reviewA}>
                      {x.q.answer}
                      {x.status === "wrong" && x.guess && <span className={s.reviewGuess}> · senin: {x.guess}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>

      {statsOpen && stats && (
        <div className={s.modalBack} onClick={() => setStatsOpen(false)}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-label="İstatistikler" onClick={(e) => e.stopPropagation()}>
            <button className={s.modalClose} onClick={() => setStatsOpen(false)} aria-label="Kapat">×</button>
            <StatsPanel
              stats={stats}
              onReset={() => {
                if (confirm("Tüm istatistiklerin silinsin mi?")) setStats(resetStats());
              }}
            />
          </div>
        </div>
      )}

      {helpOpen && (
        <div className={s.modalBack} onClick={() => setHelpOpen(false)}>
          <div className={s.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className={s.modalClose} onClick={() => setHelpOpen(false)} aria-label="Kapat">×</button>
            <h2>Nasıl oynanır</h2>
            <p>Her harf için 2000 sonrası EuroLeague hakkında bir soru gelir. Cevap o harfle başlar ya da içinde o harf geçer.</p>
            <ul>
              <li><strong>Enter</strong> ya da ok tuşu: cevapla</li>
              <li><strong>Pas</strong> (ya da boşken Enter): sonraki harfe geç, tur sonunda geri gel</li>
              <li>Yanlış cevap o harfi kapatır.</li>
              <li>4 dakika bittiğinde ya da tüm harfler kapandığında oyun biter.</li>
            </ul>
            <div className={s.legend}>
              <span><i className={s.st_correct} /> doğru</span>
              <span><i className={s.st_wrong} /> yanlış</span>
              <span><i className={s.st_passed} /> pas</span>
            </div>
            <p className={s.muted}>Cevaplarda büyük/küçük harf, aksan ve küçük yazım hataları önemli değil. Soyad tek başına yeterli.</p>
          </div>
        </div>
      )}
    </div>
  );
}
