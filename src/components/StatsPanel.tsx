import { formatTime, type Stats } from "@/lib/game";
import s from "./StatsPanel.module.css";

const BUCKETS = [
  { label: "0–5", min: 0, max: 5 },
  { label: "6–10", min: 6, max: 10 },
  { label: "11–15", min: 11, max: 15 },
  { label: "16–20", min: 16, max: 20 },
  { label: "21–26", min: 21, max: 26 },
];

const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default function StatsPanel({ stats, onReset }: { stats: Stats; onReset: () => void }) {
  const { history } = stats;
  const last = history[history.length - 1];
  const answered = history.reduce((n, g) => n + g.correct + g.wrong, 0);
  const correct = history.reduce((n, g) => n + g.correct, 0);
  const accuracy = answered ? Math.round((correct / answered) * 100) : null;
  const avg = (stats.played ? stats.totalCorrect / stats.played : 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const counts = BUCKETS.map((b) => history.filter((g) => g.correct >= b.min && g.correct <= b.max).length);
  const maxCount = Math.max(1, ...counts);
  const lastBucket = last ? BUCKETS.findIndex((b) => last.correct >= b.min && last.correct <= b.max) : -1;

  return (
    <div className={s.panel}>
      <h2>İstatistikler</h2>

      <div className={s.tiles}>
        <div><strong>{stats.played}</strong><span>Oyun</span></div>
        <div><strong>{stats.best}</strong><span>En iyi</span></div>
        <div><strong>{avg}</strong><span>Ortalama</span></div>
        <div><strong>{accuracy === null ? "–" : `%${accuracy}`}</strong><span>İsabet</span></div>
      </div>

      {stats.played === 0 ? (
        <p className={s.empty}>Henüz oyun oynamadın. İlk oyunundan sonra istatistiklerin burada görünecek.</p>
      ) : history.length === 0 ? (
        <p className={s.empty}>Ayrıntılı geçmiş bir sonraki oyunundan itibaren tutulacak.</p>
      ) : (
        <>
          <h3>Doğru sayısı dağılımı</h3>
          <div className={s.bars} role="table" aria-label="Doğru sayısına göre oyun dağılımı">
            {BUCKETS.map((b, i) => (
              <div key={b.label} className={s.barRow} role="row" title={`${b.label} doğru: ${counts[i]} oyun`}>
                <span className={s.barLabel} role="rowheader">{b.label}</span>
                <span className={s.barTrack} role="cell">
                  <span
                    className={`${s.bar} ${i === lastBucket ? s.barLast : ""}`}
                    style={{ width: `${Math.max(8, (counts[i] / maxCount) * 100)}%` }}
                  >
                    {counts[i]}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <h3>Son oyunlar</h3>
          <ol className={s.recent}>
            {history.slice(-10).reverse().map((g) => (
              <li key={g.at}>
                <span className={s.when}>{dateFmt.format(g.at)}</span>
                <span className={s.score}>
                  <b>{g.correct}</b>/{g.total}
                </span>
                <span className={s.meta}>
                  {g.wrong} yanlış · {formatTime(g.ms)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      {stats.played > 0 && (
        <button className={s.reset} onClick={onReset}>İstatistikleri sıfırla</button>
      )}
    </div>
  );
}
