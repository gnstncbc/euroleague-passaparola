"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fitsLetter, isCorrect, normalize } from "@/lib/match";
import { LETTERS, ruleLabel, type Question, type Rule } from "@/lib/types";
import type { StoreKind } from "@/lib/store";
import s from "./Admin.module.css";

type Draft = Omit<Question, "id" | "alternates"> & { id?: string; alternatesText: string };

const emptyDraft = (letter = "A"): Draft => ({
  letter,
  rule: "starts",
  question: "",
  answer: "",
  alternatesText: "",
});

const toDraft = (q: Question): Draft => ({ ...q, alternatesText: q.alternates.join("\n") });

const splitAlternates = (text: string) =>
  text.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Hata (${res.status})`);
  return data as T;
}

export default function AdminPanel({ initial, storeKind }: { initial: Question[]; storeKind: StoreKind }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [letter, setLetter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testGuess, setTestGuess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const q of list) c[q.letter] = (c[q.letter] ?? 0) + 1;
    return c;
  }, [list]);

  const visible = useMemo(() => {
    const term = normalize(search);
    return list.filter(
      (q) =>
        (!letter || q.letter === letter) &&
        (!term || normalize(`${q.question} ${q.answer} ${q.alternates.join(" ")}`).includes(term)),
    );
  }, [list, letter, search]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 2500);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const open = (d: Draft) => {
    setDraft(d);
    setTestGuess("");
    setError("");
  };

  const save = () =>
    run(async () => {
      if (!draft) return;
      const body = { ...draft, alternates: splitAlternates(draft.alternatesText) };
      const saved = draft.id
        ? await api<Question>(`/api/admin/questions/${encodeURIComponent(draft.id)}`, "PUT", body)
        : await api<Question>("/api/admin/questions", "POST", body);
      setList((l) => {
        const rest = l.filter((q) => q.id !== saved.id);
        return [...rest, saved].sort((a, b) => a.letter.localeCompare(b.letter) || a.id.localeCompare(b.id));
      });
      setDraft(null);
      flash(draft.id ? "Soru güncellendi" : "Soru eklendi");
    });

  const remove = (q: Question) => {
    if (!confirm(`"${q.answer}" cevaplı soru silinsin mi?`)) return;
    run(async () => {
      await api(`/api/admin/questions/${encodeURIComponent(q.id)}`, "DELETE");
      setList((l) => l.filter((x) => x.id !== q.id));
      setDraft(null);
      flash("Soru silindi");
    });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `passaparola-sorular-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setError("Dosya geçerli bir JSON değil");
      return;
    }
    if (!Array.isArray(data)) return setError("JSON bir soru dizisi olmalı");
    if (!confirm(`Mevcut ${list.length} sorunun yerine dosyadaki ${data.length} soru yüklenecek. Devam?`)) return;
    run(async () => {
      setList(await api<Question[]>("/api/admin/questions", "PUT", data));
      flash("Sorular içe aktarıldı");
    });
  };

  const resetDefaults = () => {
    if (!confirm("Tüm sorular silinip varsayılan soru seti geri yüklenecek. Emin misin?")) return;
    run(async () => {
      setList(await api<Question[]>("/api/admin/questions", "PUT", { reset: true }));
      flash("Varsayılan sorular yüklendi");
    });
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  };

  const alternates = draft ? splitAlternates(draft.alternatesText) : [];
  const letterOk = draft && draft.answer ? fitsLetter(draft.answer, draft.letter, draft.rule) : true;
  const testResult = draft && testGuess.trim() ? isCorrect(testGuess, draft.answer, alternates) : null;

  return (
    <div className={s.page}>
      <header className={s.top}>
        <h1 className={s.brand}>
          Passaparola <span>Admin</span>
        </h1>
        <div className={s.topActions}>
          <a className={s.ghostSm} href="/" target="_blank" rel="noreferrer">Oyun ↗</a>
          <button className={s.ghostSm} onClick={logout}>Çıkış</button>
        </div>
      </header>

      {storeKind === "memory" && (
        <p className={s.warn}>
          Redis bağlı değil: değişiklikler sadece bu sunucu çalıştığı sürece geçerli. Kalıcı olması için Vercel&apos;de
          Upstash Redis bağla (README&apos;ye bak).
        </p>
      )}

      <div className={s.toolbar}>
        <input
          className={s.input}
          placeholder="Soru veya cevap ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className={s.primary} onClick={() => open(emptyDraft(letter ?? "A"))}>+ Yeni soru</button>
      </div>

      <div className={s.letters}>
        <button className={`${s.chip} ${!letter ? s.chipOn : ""}`} onClick={() => setLetter(null)}>
          Tümü <small>{list.length}</small>
        </button>
        {LETTERS.map((l) => (
          <button
            key={l}
            className={`${s.chip} ${letter === l ? s.chipOn : ""} ${!counts[l] ? s.chipEmpty : ""}`}
            onClick={() => setLetter(letter === l ? null : l)}
            title={`${counts[l] ?? 0} soru`}
          >
            {l} <small>{counts[l] ?? 0}</small>
          </button>
        ))}
      </div>

      {error && !draft && <p className={s.error}>{error}</p>}

      <ul className={s.list}>
        {visible.map((q) => (
          <li key={q.id} className={s.item}>
            <button className={s.itemMain} onClick={() => open(toDraft(q))}>
              <span className={s.badge}>{q.letter}</span>
              <span className={s.itemText}>
                <span className={s.itemQ}>{q.question}</span>
                <span className={s.itemA}>
                  {q.answer}
                  {q.alternates.length > 0 && <em> · {q.alternates.join(", ")}</em>}
                </span>
                <span className={s.itemRule}>{ruleLabel(q.letter, q.rule)}</span>
              </span>
            </button>
            <button className={s.del} onClick={() => remove(q)} aria-label="Sil" disabled={busy}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
        {!visible.length && <li className={s.empty}>Soru bulunamadı.</li>}
      </ul>

      <footer className={s.footer}>
        <button className={s.ghostSm} onClick={exportJson}>JSON dışa aktar</button>
        <button className={s.ghostSm} onClick={() => fileRef.current?.click()} disabled={busy}>JSON içe aktar</button>
        <button className={s.ghostSm} onClick={resetDefaults} disabled={busy}>Varsayılanlara dön</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) importJson(f);
          }}
        />
      </footer>

      {notice && <div className={s.toast}>{notice}</div>}

      {draft && (
        <div className={s.sheetBack} onClick={() => !busy && setDraft(null)}>
          <form
            className={s.sheet}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className={s.sheetHead}>
              <h2>{draft.id ? "Soruyu düzenle" : "Yeni soru"}</h2>
              <button type="button" className={s.close} onClick={() => setDraft(null)} aria-label="Kapat">×</button>
            </div>

            <div className={s.fieldRow}>
              <label className={s.field}>
                <span>Harf</span>
                <select
                  className={s.input}
                  value={draft.letter}
                  onChange={(e) => setDraft({ ...draft, letter: e.target.value })}
                >
                  {LETTERS.map((l) => <option key={l}>{l}</option>)}
                </select>
              </label>
              <div className={s.field}>
                <span>Kural</span>
                <div className={s.segment}>
                  {(["starts", "contains"] as Rule[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={draft.rule === r ? s.segOn : ""}
                      onClick={() => setDraft({ ...draft, rule: r })}
                    >
                      {r === "starts" ? "ile başlar" : "içinde"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className={s.field}>
              <span>Soru</span>
              <textarea
                className={s.input}
                rows={3}
                value={draft.question}
                onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                required
              />
            </label>

            <label className={s.field}>
              <span>Cevap</span>
              <input
                className={s.input}
                value={draft.answer}
                onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                required
              />
              {!letterOk && (
                <small className={s.hintWarn}>
                  Cevapta “{ruleLabel(draft.letter, draft.rule)}” kuralına uyan bir kelime yok.
                </small>
              )}
            </label>

            <label className={s.field}>
              <span>Kabul edilecek diğer cevaplar <em>(her satıra bir tane)</em></span>
              <textarea
                className={s.input}
                rows={2}
                value={draft.alternatesText}
                onChange={(e) => setDraft({ ...draft, alternatesText: e.target.value })}
                placeholder={"ör. Spanoulis\nKill Bill"}
              />
              <small className={s.hint}>
                Soyad, küçük yazım hataları, aksanlar ve eksik yazımlar zaten otomatik kabul edilir.
              </small>
            </label>

            <label className={`${s.field} ${s.tester}`}>
              <span>Cevabı dene</span>
              <input
                className={s.input}
                value={testGuess}
                onChange={(e) => setTestGuess(e.target.value)}
                placeholder="Oyuncu ne yazarsa…"
              />
              {testResult !== null && (
                <small className={testResult ? s.ok : s.hintWarn}>
                  {testResult ? "✓ Kabul edilir" : "✗ Kabul edilmez"}
                </small>
              )}
            </label>

            {error && <p className={s.error}>{error}</p>}

            <div className={s.sheetActions}>
              {draft.id && (
                <button
                  type="button"
                  className={s.danger}
                  onClick={() => remove({ ...draft, id: draft.id!, alternates })}
                  disabled={busy}
                >
                  Sil
                </button>
              )}
              <span className={s.spacer} />
              <button type="button" className={s.ghostSm} onClick={() => setDraft(null)}>Vazgeç</button>
              <button className={s.primary} disabled={busy}>{busy ? "…" : "Kaydet"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
